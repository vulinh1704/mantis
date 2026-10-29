/**
 * The style values a page actually uses, for `mantis learn` and the off-style detector. Serialized
 * into the page like lib.js, so it must stay self-contained; it relies on `window.__mantis`.
 *
 * - groups: every visible element's colors by role (text, bg, border), font size, family and
 *   weight (elements with their own text), corner radius (elements with a background, a border or
 *   a replaced/form element), padding and flex/grid gaps, box shadow, and transition/animation
 *   durations and easings. Each value is counted, with a few example elements.
 * - tokens: CSS custom properties defined in same-origin style sheets that resolve on :root, by
 *   kind (color, length, duration, easing, shadow, font) with their value in the units above.
 *
 * Colors are lowercase hex (#rrggbb, or #rrggbbaa when translucent), lengths are px numbers,
 * durations ms; a radius of 50% or 999px and more is "full".
 *
 * @param {{limit?: number, examples?: number, tokens?: boolean}} [input]
 */
export function collectStyle({ limit = 6000, examples = 3, tokens = true } = {}) {
  const M = window.__mantis;
  M.reset();
  const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  const hexOf = (c) => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}${c[3] < 0.995 ? hex2(c[3] * 255) : ''}`;
  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  };
  const ms = (v) => {
    const s = String(v).trim();
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return null;
    return Math.round(s.endsWith('ms') ? n : n * 1000);
  };
  // Split a computed list on top-level commas: "cubic-bezier(0.4, 0, 0.2, 1), ease" -> 2 items.
  const splitList = (v) => {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of String(v)) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        out.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  };
  const firstFamily = (v) => splitList(v)[0]?.replace(/^["']|["']$/g, '') || null;

  const groups = {};
  const add = (kind, value, el, role) => {
    if (value === null || value === undefined) return;
    const m = groups[kind] || (groups[kind] = new Map());
    let g = m.get(value);
    if (!g) m.set(value, (g = { uses: 0, roles: {}, els: [] }));
    g.uses++;
    if (role) g.roles[role] = (g.roles[role] || 0) + 1;
    if (g.els.length < examples && !g.els.includes(el)) g.els.push(el);
  };

  let elements = 0;
  const all = document.body ? document.body.querySelectorAll('*') : [];
  for (const el of all) {
    if (elements >= limit) break;
    if (el instanceof SVGElement || el.closest('[data-mantis-overlay]')) continue;
    if (M.ignored(el) || !M.isRendered(el) || M.offscreen(el) || M.ariaHidden(el) || M.visuallyHidden(el)) continue;
    elements++;
    const s = M.style(el);
    if (M.hasOwnText(el)) {
      const c = M.parseColor(s.color);
      if (c && c[3] > 0) add('color', hexOf(c), el, 'text');
      add('fontSize', px(s.fontSize), el);
      add('fontFamily', firstFamily(s.fontFamily), el);
      add('fontWeight', Number(s.fontWeight) || 400, el);
    }
    const bg = M.parseColor(s.backgroundColor);
    const hasBg = !!bg && bg[3] > 0;
    if (hasBg) add('color', hexOf(bg), el, 'bg');
    const borders = new Set();
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
      if (!(parseFloat(s[`border${side}Width`]) > 0) || /none|hidden/.test(s[`border${side}Style`])) continue;
      const c = M.parseColor(s[`border${side}Color`]);
      if (c && c[3] > 0) borders.add(hexOf(c));
    }
    for (const b of borders) add('color', b, el, 'border');
    if (hasBg || borders.size || /^(IMG|VIDEO|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      const raw = s.borderTopLeftRadius;
      const n = parseFloat(raw);
      if (n > 0) add('radius', raw.endsWith('%') ? (n >= 50 ? 'full' : raw) : n >= 999 ? 'full' : px(raw), el);
    }
    for (const p of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft']) {
      const n = px(s[p]);
      if (n > 0) add('spacing', n, el);
    }
    if (/flex|grid/.test(s.display)) {
      for (const p of ['rowGap', 'columnGap']) {
        const n = px(s[p]);
        if (n > 0) add('spacing', n, el);
      }
    }
    if (s.boxShadow && s.boxShadow !== 'none') add('shadow', s.boxShadow, el);
    const timing = (durations, easings) => {
      const ds = splitList(durations);
      const es = splitList(easings);
      ds.forEach((d, i) => {
        const v = ms(d);
        if (!(v > 0)) return;
        add('duration', v, el);
        if (es.length) add('easing', es[i % es.length], el);
      });
    };
    timing(s.transitionDuration, s.transitionTimingFunction);
    if (s.animationName && s.animationName !== 'none') timing(s.animationDuration, s.animationTimingFunction);
  }

  const out = { elements, groups: {}, tokens: {}, sheetsSkipped: 0 };
  for (const [kind, m] of Object.entries(groups)) {
    out.groups[kind] = [...m].map(([value, g]) => ({
      value,
      uses: g.uses,
      roles: g.roles,
      examples: g.els.map((el) => ({
        sel: M.cssPath(el),
        rect: M.round(M.visibleDocRect(el) || M.docRect(el)),
        text: M.snippet(el.innerText || el.textContent || '', 40),
      })),
    }));
  }

  if (tokens) {
    const names = new Set();
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.style) {
          for (let i = 0; i < rule.style.length; i++) if (rule.style[i].startsWith('--')) names.add(rule.style[i]);
        }
        if (rule.cssRules) walk(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules);
      } catch {
        out.sheetsSkipped++; // cross-origin style sheet
      }
    }
    const root = getComputedStyle(document.documentElement);
    const rootFont = parseFloat(root.fontSize) || 16;
    const probe = document.createElement('div');
    probe.setAttribute('data-mantis-overlay', '');
    probe.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;visibility:hidden';
    document.documentElement.appendChild(probe);
    const viaProbe = (prop, value) => {
      probe.style.setProperty(prop, value);
      const v = getComputedStyle(probe).getPropertyValue(prop);
      probe.style.removeProperty(prop);
      return v;
    };
    let count = 0;
    for (const name of names) {
      if (count++ >= 2000) break;
      const raw = root.getPropertyValue(name).trim();
      if (!raw) continue;
      let token = null;
      if (/^-?[\d.]+m?s$/.test(raw)) token = { kind: 'duration', value: ms(raw) };
      else if (!/^(inherit|initial|unset|revert|currentcolor|transparent)$/i.test(raw) && CSS.supports('color', raw)) {
        const c = M.parseColor(raw);
        if (c) token = { kind: 'color', value: hexOf(c) };
      } else if (/^-?[\d.]+(px|rem)$/.test(raw)) token = { kind: 'length', value: raw.endsWith('rem') ? Math.round(parseFloat(raw) * rootFont * 100) / 100 : px(raw) };
      else if (/^calc\(|^clamp\(|^min\(|^max\(/.test(raw) && CSS.supports('width', raw)) token = { kind: 'length', value: px(viaProbe('width', raw)) };
      else if (/cubic-bezier|steps\(|^(ease|ease-in|ease-out|ease-in-out|linear)$/.test(raw) && CSS.supports('transition-timing-function', raw)) {
        token = { kind: 'easing', value: viaProbe('transition-timing-function', raw) };
      } else if (/\dpx/.test(raw) && CSS.supports('box-shadow', raw)) token = { kind: 'shadow', value: viaProbe('box-shadow', raw) };
      else if (/,|["']/.test(raw) && CSS.supports('font-family', raw)) token = { kind: 'font', value: firstFamily(raw) };
      if (token && token.value !== null && token.value !== '') out.tokens[name] = token;
    }
    probe.remove();
  }
  return out;
}
