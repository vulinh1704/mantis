import { chroma, contrastRatio, isLargeText, luminance, over, sameColor, toHex } from '../color.js';

/**
 * theme-leak (error, cross-cell): parts of the page that ignore the dark color scheme.
 *
 * Compares the light and dark cells of the same route + viewport + locale. Elements are matched
 * by their structural path (and tag/id/class signature). Only runs when the page background
 * really flipped (light page luminance > 0.4, dark page < 0.12). Two findings, reported in the
 * dark cell:
 * - container: an element with its own opaque background that stays the same light neutral
 *   color (luminance >= 0.6, low chroma) in both schemes, stands out against the dark page
 *   (contrast >= 3) and holds text. Brand-colored surfaces (buttons, badges) are left alone
 *   because they are saturated. Only the outermost leaking container is reported.
 * - text: text whose color is identical in both schemes while the background behind it flipped
 *   from light to dark, and whose contrast passed in light but fails in dark. Sibling findings
 *   are grouped under their parent.
 */

function collectSnapshot() {
  const M = window.__mantis;
  M.reset();
  const els = [];
  const skip = new Set(['script', 'style', 'noscript', 'template', 'link', 'meta', 'br', 'wbr', 'source', 'track', 'option', 'optgroup']);
  const all = document.body ? document.body.getElementsByTagName('*') : [];
  for (const el of all) {
    if (els.length >= 6000) break;
    if (skip.has(el.localName) || M.inOverlay(el)) continue;
    if (el instanceof SVGElement && el.localName !== 'svg') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (!M.isRendered(el)) continue;
    const s = M.style(el);
    const rec = {
      k: M.structKey(el),
      sig: M.signature(el),
      w: Math.round(r.width),
      h: Math.round(r.height),
      bg: M.parseColor(s.backgroundColor),
      bi: !!(s.backgroundImage && s.backgroundImage !== 'none'),
      rep: M.REPLACED.has(el.localName) || el instanceof SVGElement,
    };
    if (M.hasOwnText(el)) {
      rec.c = M.parseColor(s.color);
      rec.eb = M.effectiveBackground(el);
      rec.fs = parseFloat(s.fontSize);
      rec.fw = s.fontWeight;
      rec.op = M.effectiveOpacity(el);
      rec.t = M.snippet(el.textContent, 40);
    }
    els.push(rec);
  }
  return { pageBg: M.pageBackground(), els };
}

const parentKey = (k) => k.slice(0, k.lastIndexOf('/'));

/**
 * Pure comparison of two snapshots (exported for unit tests).
 * @returns {{flipped: boolean, unchanged: boolean, lightBg: string, darkBg: string, findings: object[]}}
 */
export function compareSnapshots(light, dark) {
  const L = light.pageBg;
  const D = dark.pageBg;
  const result = { flipped: false, unchanged: sameColor(L, D, 10), lightBg: toHex(L), darkBg: toHex(D), findings: [] };
  if (!(luminance(L) > 0.4 && luminance(D) < 0.12)) return result;
  result.flipped = true;

  const lightByKey = new Map(light.els.map((e) => [e.k, e]));
  const textKeys = new Set();
  for (const e of dark.els) {
    if (!e.c) continue;
    for (let k = e.k; k && !textKeys.has(k); k = parentKey(k)) textKeys.add(k);
  }

  const containers = [];
  for (const d of dark.els) {
    const l = lightByKey.get(d.k);
    if (!l || l.sig !== d.sig) continue;
    if (d.rep || d.bi || l.bi) continue;
    if (!d.bg || !l.bg || d.bg[3] < 0.9 || l.bg[3] < 0.9) continue;
    if (d.w * d.h < 600) continue;
    if (!sameColor(d.bg, l.bg, 6)) continue;
    if (luminance(d.bg) < 0.6 || chroma(d.bg) > 0.15) continue;
    if (contrastRatio(d.bg, D) < 3) continue;
    if (!textKeys.has(d.k)) continue;
    containers.push(d);
  }
  containers.sort((a, b) => a.k.length - b.k.length);
  const keptContainers = [];
  for (const c of containers) {
    if (!keptContainers.some((k) => c.k.startsWith(k.k + '/'))) keptContainers.push(c);
  }
  for (const c of keptContainers) {
    const inside = dark.els.filter((e) => e.c && e.eb && e.k.startsWith(c.k + '/') && contrastRatio(over(e.c, e.eb), e.eb) < 3);
    result.findings.push({
      key: c.k,
      kind: 'container',
      message: `keeps its light background ${toHex(c.bg)} in dark mode while the page switched to ${toHex(D)} — a hard-coded color instead of a theme token${inside.length ? `; ${inside.length} text element${inside.length > 1 ? 's' : ''} inside become${inside.length > 1 ? '' : 's'} near-invisible` : ''}.`,
      evidence: { background: toHex(c.bg), pageLight: toHex(L), pageDark: toHex(D), unreadableTextInside: inside.length },
    });
  }

  const texts = [];
  for (const d of dark.els) {
    if (!d.c) continue;
    const l = lightByKey.get(d.k);
    if (!l || l.sig !== d.sig || !l.c) continue;
    if (!d.eb || !l.eb) continue;
    if ((d.op ?? 1) < 0.5) continue;
    if (!sameColor(d.c, l.c, 8)) continue;
    if (luminance(l.eb) < 0.4 || luminance(d.eb) > 0.12) continue;
    if (keptContainers.some((c) => d.k.startsWith(c.k + '/'))) continue;
    const need = isLargeText(d.fs, d.fw) ? 3 : 4.5;
    const cL = contrastRatio(over(l.c, l.eb), l.eb);
    const cD = contrastRatio(over(d.c, d.eb), d.eb);
    if (cL < need || cD >= need) continue;
    texts.push({ d, l, cL, cD });
  }
  // Group siblings that share the same leaking color under their parent.
  const byParent = new Map();
  for (const t of texts) {
    const p = parentKey(t.d.k);
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(t);
  }
  for (const [p, group] of byParent) {
    const first = group[0];
    const color = toHex(first.d.c);
    const base = {
      kind: 'text',
      evidence: {
        color,
        backgroundLight: toHex(first.l.eb),
        backgroundDark: toHex(first.d.eb),
        contrastLight: Math.round(first.cL * 100) / 100,
        contrastDark: Math.round(first.cD * 100) / 100,
        text: first.d.t,
        count: group.length,
      },
    };
    if (group.length >= 2) {
      result.findings.push({
        ...base,
        key: p,
        message: `holds ${group.length} text elements whose color ${color} does not change in dark mode while their background goes from ${toHex(first.l.eb)} to ${toHex(first.d.eb)} (contrast ${first.cL.toFixed(1)}:1 → ${first.cD.toFixed(1)}:1). Use a theme token for this color.`,
      });
    } else {
      result.findings.push({
        ...base,
        key: first.d.k,
        message: `text "${first.d.t}" keeps color ${color} in dark mode while its background goes from ${toHex(first.l.eb)} to ${toHex(first.d.eb)} (contrast ${first.cL.toFixed(1)}:1 → ${first.cD.toFixed(1)}:1). Use a theme token for this color.`,
      });
    }
  }
  return result;
}

export default {
  name: 'theme-leak',
  cross: true,
  /** Per-cell snapshot of colors, taken after the per-cell detectors. */
  async collect(page) {
    return page.evaluate(collectSnapshot);
  },
  compare: compareSnapshots,
  /** Turn findings into issues by resolving keys to selectors/rects in the dark page. */
  async resolve(page, findings) {
    if (!findings.length) return [];
    const resolved = await page.evaluate((keys) => {
      const M = window.__mantis;
      return keys.map((k) => {
        const el = M.byStructKey(k);
        return el ? { selector: M.cssPath(el), rect: M.round(M.docRect(el)) } : null;
      });
    }, findings.map((f) => f.key));
    const issues = [];
    findings.forEach((f, i) => {
      const r = resolved[i];
      if (!r) return;
      issues.push({
        type: 'theme-leak',
        severity: 'error',
        key: f.kind,
        selector: r.selector,
        rect: r.rect,
        message: `\`${r.selector}\` ${f.message}`,
        evidence: { kind: f.kind, ...f.evidence },
      });
    });
    return issues;
  },
};
