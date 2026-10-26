/**
 * layout-shift (warn): Cumulative Layout Shift during load above 0.1 (the "good" threshold).
 *
 * A PerformanceObserver('layout-shift', buffered) is registered before any page script runs and
 * the value is read once the page has settled, before Mantis scrolls the page. CLS uses the
 * web-vitals definition: the largest session window (shifts < 1s apart, window <= 5s).
 * `hadRecentInput` is deliberately ignored: Mantis never interacts with the page before this
 * point, and Chromium's mobile emulation records a synthetic input right after navigation that
 * would otherwise hide every shift of the first half second on phone/tablet viewports.
 *
 * The issue points at the likely cause when it can be told — an element just above the moved
 * content whose height matches the shift distance (typically an image, embed or ad without
 * reserved space) — and otherwise at the element that moved the most.
 */
export const THRESHOLD = 0.1;

function initLayoutShiftObserver() {
  const store = { entries: [] };
  Object.defineProperty(window, '__mantisLayoutShifts', { value: store, configurable: true });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const rect = (r) => (r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null);
        store.entries.push({
          value: e.value,
          time: e.startTime,
          sources: (e.sources || []).map((s) => ({ node: s.node || null, prev: rect(s.previousRect), cur: rect(s.currentRect) })),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    // layout-shift entries unsupported
  }
}

function measureShifts() {
  const M = window.__mantis;
  M.reset();
  const store = window.__mantisLayoutShifts;
  if (!store) return null;
  const entries = store.entries.slice().sort((a, b) => a.time - b.time);
  let best = { value: 0, entries: [] };
  let cur = { value: 0, entries: [], start: 0, last: 0 };
  for (const e of entries) {
    if (cur.entries.length && (e.time - cur.last >= 1000 || e.time - cur.start >= 5000)) {
      cur = { value: 0, entries: [], start: e.time, last: e.time };
    }
    if (!cur.entries.length) cur.start = e.time;
    cur.entries.push(e);
    cur.value += e.value;
    cur.last = e.time;
    if (cur.value > best.value) best = { value: cur.value, entries: cur.entries.slice() };
  }

  // How far each node moved in the worst window. Sources that left the viewport have an empty
  // current rect, so their distance is unknown and they only count towards the score.
  const moved = new Map();
  for (const e of best.entries) {
    for (const s of e.sources) {
      if (!s.node || !s.prev || !s.cur) continue;
      const el = s.node.nodeType === 1 ? s.node : s.node.parentElement;
      if (!el) continue;
      const m = moved.get(el) || { el, dx: 0, dy: 0, score: 0, measured: false };
      const prevArea = s.prev.width * s.prev.height;
      const curArea = s.cur.width * s.cur.height;
      if (prevArea > 0 && curArea > 0) {
        m.dx += s.cur.x - s.prev.x;
        m.dy += s.cur.y - s.prev.y;
        m.measured = true;
      }
      m.score += e.value * Math.max(1, prevArea, curArea);
      moved.set(el, m);
    }
  }
  const ranked = [...moved.values()].filter((m) => m.el.isConnected).sort((a, b) => b.score - a.score);
  const measured = ranked.filter((m) => m.measured && Math.abs(m.dy) + Math.abs(m.dx) >= 1);
  const top = measured[0] || ranked[0] || null;

  // Likely cause: content above a moved element whose height matches the distance it moved.
  const media = (n) => /^(img|picture|video|iframe|embed|object|canvas)$/.test(n.localName) || !!n.querySelector('img, picture, video, iframe, embed, object, canvas');
  let cause = null;
  for (const m of measured.slice(0, 5)) {
    const shift = Math.abs(m.dy);
    if (shift < 8) continue;
    const candidates = [];
    let level = 0;
    for (let n = m.el; n && n !== document.body && level < 4; n = n.parentElement, level++) {
      let k = 0;
      for (let p = n.previousElementSibling; p && k < 6; p = p.previousElementSibling, k++) {
        const h = p.getBoundingClientRect().height;
        if (h > 0 && Math.abs(h - shift) <= Math.max(6, shift * 0.25)) candidates.push(p);
      }
    }
    const pick = candidates.find(media) || candidates[0];
    if (pick) {
      const img = pick.localName === 'img' ? pick : pick.querySelector('img');
      cause = {
        selector: M.cssPath(pick),
        rect: M.round(M.docRect(pick)),
        height: Math.round(pick.getBoundingClientRect().height),
        missingSize: !!img && !(img.getAttribute('width') && img.getAttribute('height')) && M.style(img).aspectRatio === 'auto',
      };
      break;
    }
  }
  return {
    cls: Math.round(best.value * 1000) / 1000,
    shifts: best.entries.length,
    moved: ranked.slice(0, 5).map((m) => ({ selector: M.cssPath(m.el), dx: m.measured ? Math.round(m.dx) : null, dy: m.measured ? Math.round(m.dy) : null })),
    top: top ? { selector: M.cssPath(top.el), rect: M.round(M.docRect(top.el)), dy: top.measured ? Math.round(top.dy) : null } : null,
    cause,
  };
}

export default {
  name: 'layout-shift',
  phase: 'load',
  async setup(page) {
    await page.addInitScript(initLayoutShiftObserver);
  },
  async run(page, ctx) {
    const data = await page.evaluate(measureShifts);
    if (!data) return [];
    ctx.cellInfo.cls = data.cls;
    if (data.cls <= THRESHOLD) return [];
    const moveText = data.top
      ? ` \`${data.top.selector}\`${data.top.dy ? ` was pushed ${data.top.dy > 0 ? 'down' : 'up'} ${Math.abs(data.top.dy)}px` : ' moved'}.`
      : '';
    const causeText = data.cause
      ? ` Likely cause: \`${data.cause.selector}\` (${data.cause.height}px tall${data.cause.missingSize ? ', <img> without width/height' : ''}) appeared above it without reserved space.`
      : ' Reserve space for late content (width/height or aspect-ratio on media, min-height on async blocks).';
    const target = data.cause || data.top;
    return [{
      type: 'layout-shift',
      severity: 'warn',
      dedupeKey: 'cls',
      selector: target ? target.selector : null,
      rect: target ? target.rect : null,
      message: `Layout shifts during load: CLS ${data.cls} (threshold ${THRESHOLD}).${moveText}${causeText}`,
      evidence: { cls: data.cls, shifts: data.shifts, moved: data.moved, likelyCause: data.cause },
    }];
  },
};
