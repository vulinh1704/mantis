/**
 * Per-cell state that a later run compares against (see src/compare.js), collected after the
 * detectors ran. Serialized into the page like lib.js, so it must stay self-contained; it relies
 * on `window.__mantis` being installed.
 *
 * - probes: for each target selector, whether the element is still there and visible, the share
 *   of its box that overflow clipping leaves visible, its smallest font size, its transform scale
 *   and its text. Targets are the elements behind this run's issues and the baseline run's issues
 *   in the same cell. When a selector no longer matches, the same text in the same kind of
 *   element counts as the same element (markup that moved).
 * - inventory: every visible control and heading, keyed by kind + accessible name, so a later run
 *   can tell when one disappears.
 *
 * @param {{targets?: {s: string, t?: string|null, g?: string|null}[], inventory?: boolean, limit?: number}} input
 */
export function collectState({ targets = [], inventory = true, limit = 1500 } = {}) {
  const M = window.__mantis;
  M.reset();
  const html = document.documentElement;
  const body = document.body;
  const vw = html.clientWidth;
  const hides = (s) => s.overflowX === 'hidden' || s.overflowX === 'clip';
  const viewportClipsX = hides(M.style(html)) || (!!body && hides(M.style(body)));

  const visible = (el) => M.isRendered(el) && !M.offscreen(el) && !M.visuallyHidden(el) && !M.ariaHidden(el) &&
    M.effectiveOpacity(el) >= 0.1 && !!M.visibleDocRect(el);

  // Share of the box left visible by hidden/clip ancestors and a clipped viewport. Scroll
  // containers do not count: the user can scroll to what they hide.
  const visibleRatio = (el) => {
    const r = el.getBoundingClientRect();
    const area = r.width * r.height;
    if (area <= 0) return 0;
    let { left, top, right, bottom } = r;
    for (const c of M.clipChain(el)) {
      const s = M.style(c);
      const b = M.paddingBox(c);
      const paint = /paint|strict|content/.test(s.contain || '');
      if (M.clipsX(s) || paint) {
        left = Math.max(left, b.left);
        right = Math.min(right, b.right);
      }
      if (M.clipsY(s) || paint) {
        top = Math.max(top, b.top);
        bottom = Math.min(bottom, b.bottom);
      }
    }
    if (viewportClipsX && M.layerKind(el) !== 'fixed') {
      left = Math.max(left, -scrollX);
      right = Math.min(right, vw - scrollX);
    }
    const w = Math.max(0, right - left);
    const h = Math.max(0, bottom - top);
    return Math.round(((w * h) / area) * 100) / 100;
  };

  const minFont = (el) => {
    let min = null;
    for (const t of M.textNodes(el, 300)) {
      const f = parseFloat(M.style(t.parentElement).fontSize);
      if (f > 0 && (min === null || f < min)) min = f;
    }
    return min;
  };

  const scaleOf = (el) => {
    if (!(el instanceof HTMLElement) || !el.offsetWidth) return 1;
    return Math.round((el.getBoundingClientRect().width / el.offsetWidth) * 100) / 100;
  };

  const textOf = (el) => String(el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();

  const find = (t) => {
    try {
      const el = document.querySelector(t.s);
      if (el) return el;
    } catch {
      // not a valid selector here
    }
    if (!t.t || !t.g) return null;
    const list = document.getElementsByTagName(t.g);
    for (let i = 0; i < list.length && i < 3000; i++) {
      if (M.snippet(textOf(list[i]), 60) === t.t) return list[i];
    }
    return null;
  };

  const probes = {};
  for (const t of targets) {
    if (Object.hasOwn(probes, t.s)) continue;
    const el = find(t);
    if (!el) {
      probes[t.s] = { found: false };
      continue;
    }
    const text = textOf(el);
    probes[t.s] = {
      found: true,
      rendered: visible(el),
      ratio: visibleRatio(el),
      font: minFont(el),
      scale: scaleOf(el),
      len: text.length,
      text: M.snippet(text, 60),
      tag: el.localName,
      rect: M.round(M.docRect(el)),
    };
  }

  const items = [];
  if (inventory) {
    const kindOf = (el) => {
      const tag = el.localName;
      const role = el.getAttribute('role');
      if (/^h[1-6]$/.test(tag) || role === 'heading') return 'heading';
      if (role) return role;
      if (tag === 'a') return 'link';
      if (tag === 'input') {
        const type = (el.getAttribute('type') || 'text').toLowerCase();
        return ['submit', 'button', 'reset', 'image'].includes(type) ? 'button' : `input-${type}`;
      }
      return tag;
    };
    const nameOf = (el) => {
      const label = el.getAttribute('aria-label');
      if (label && label.trim()) return label;
      const by = el.getAttribute('aria-labelledby');
      if (by) {
        const t = by.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean).map(textOf).join(' ');
        if (t.trim()) return t;
      }
      const text = textOf(el);
      if (text) return text;
      const img = el.querySelector('img[alt]');
      if (img && img.alt.trim()) return img.alt;
      for (const a of ['title', 'placeholder', 'value', 'name', 'id', 'href']) {
        const v = el.getAttribute(a);
        if (v && v.trim()) return v;
      }
      return '';
    };
    for (const el of document.querySelectorAll(`${M.TARGETS}, h1, h2, h3, h4, h5, h6, [role="heading"]`)) {
      if (items.length >= limit) break;
      if (M.ignored(el) || !visible(el)) continue;
      const r = M.round(M.docRect(el));
      items.push({ k: `${kindOf(el)}: ${M.snippet(nameOf(el), 50)}`, s: M.cssPath(el), r: [r.x, r.y, r.width, r.height] });
    }
  }
  return { probes, inventory: items };
}
