/**
 * page-overflow (error): the document scrolls horizontally.
 *
 * Fires only when `scrollWidth > clientWidth + 1` and the viewport is actually scrollable
 * (html/body overflow-x is not hidden/clip). Reports the outermost culprits: elements whose
 * right edge passes the viewport and whose parent does not, skipping fixed-position layers and
 * anything clipped by an overflow ancestor. When several siblings overflow the same parent the
 * parent is reported once (e.g. a nowrap flex row), which is where the fix usually goes.
 */
export default {
  name: 'page-overflow',
  phase: 'dom',
  async run(page) {
    return page.evaluate(() => {
      const M = window.__mantis;
      M.reset();
      const html = document.documentElement;
      const body = document.body;
      if (!body) return [];
      const vw = html.clientWidth;
      const docWidth = Math.max(html.scrollWidth, body.scrollWidth);
      if (docWidth <= vw + 1) return [];
      const hs = M.style(html);
      const bs = M.style(body);
      const viewportOverflow = hs.overflowX !== 'visible' ? hs.overflowX : bs.overflowX;
      if (viewportOverflow === 'hidden' || viewportOverflow === 'clip') return [];

      const limit = vw + 1;
      const over = new Set();
      const culprits = [];
      const clippedX = (el) => M.clipChain(el).some((c) => {
        const s = M.style(c);
        return s.overflowX !== 'visible' || /paint|strict|content/.test(s.contain || '');
      });
      const skip = new Set(['script', 'style', 'template', 'noscript', 'link', 'meta']);
      for (const el of [body, ...body.querySelectorAll('*')]) {
        if (skip.has(el.localName) || M.inOverlay(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (r.right + scrollX <= limit) continue;
        if (M.layerKind(el) === 'fixed') continue;
        if (clippedX(el)) continue;
        over.add(el);
        if (el !== body && over.has(el.parentElement)) continue; // not outermost
        culprits.push(el);
      }

      // Text that sticks out of its element (long unbreakable strings) has no element culprit.
      if (culprits.length === 0) {
        for (const t of M.textNodes(body, 8000)) {
          const owner = t.parentElement;
          if (M.layerKind(owner) === 'fixed' || clippedX(owner)) continue;
          const rects = M.textRects(t);
          if (rects.some((r) => r.right + scrollX > limit)) {
            if (!culprits.includes(owner)) culprits.push(owner);
            if (culprits.length >= 5) break;
          }
        }
      }

      const issues = [];
      const evidenceFor = (el) => {
        const r = el.getBoundingClientRect();
        const s = M.style(el);
        return {
          viewportWidth: vw,
          documentWidth: docWidth,
          right: Math.round(r.right + scrollX),
          width: Math.round(r.width),
          overflowBy: Math.round(r.right + scrollX - vw),
          cssWidth: s.width,
          minWidth: s.minWidth,
          whiteSpace: s.whiteSpace,
          position: s.position,
        };
      };

      if (culprits.length === 0) {
        issues.push({
          type: 'page-overflow',
          severity: 'error',
          selector: 'html',
          rect: { x: vw, y: 0, width: Math.max(1, docWidth - vw), height: Math.min(html.scrollHeight, 2000) },
          message: `The page is ${docWidth}px wide in a ${vw}px viewport and scrolls horizontally, but no single element could be blamed (check pseudo-elements and negative margins).`,
          evidence: { viewportWidth: vw, documentWidth: docWidth },
        });
        return issues;
      }

      // Group siblings that overflow the same parent.
      const byParent = new Map();
      for (const el of culprits) {
        const p = el === body ? null : el.parentElement;
        const key = p || el;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(el);
      }
      for (const [parent, els] of byParent) {
        if (els.length >= 2 && parent !== body && parent !== html) {
          const maxRight = Math.max(...els.map((e) => e.getBoundingClientRect().right + scrollX));
          const sel = M.cssPath(parent);
          const ev = evidenceFor(parent);
          ev.overflowBy = Math.round(maxRight - vw);
          ev.children = els.slice(0, 6).map((e) => M.cssPath(e));
          issues.push({
            type: 'page-overflow',
            severity: 'error',
            selector: sel,
            rect: M.round(M.docRect(parent)),
            message: `${els.length} children of \`${sel}\` extend up to ${ev.overflowBy}px past the ${vw}px viewport, so the page scrolls horizontally (white-space: ${ev.whiteSpace}). Let the row wrap or shrink.`,
            evidence: ev,
          });
        } else {
          for (const el of els) {
            const sel = M.cssPath(el);
            const ev = evidenceFor(el);
            issues.push({
              type: 'page-overflow',
              severity: 'error',
              selector: sel,
              rect: M.round(M.docRect(el)),
              message: `\`${sel}\` is ${ev.width}px wide and extends ${ev.overflowBy}px past the ${vw}px viewport, so the page scrolls horizontally.`,
              evidence: ev,
            });
          }
        }
      }
      return issues;
    });
  },
};
