/**
 * page-overflow (error): content wider than the viewport.
 *
 * - The document scrolls horizontally (`scrollWidth > clientWidth + 1`): reports the outermost
 *   culprits, elements whose right edge passes the viewport and whose parent does not, skipping
 *   fixed-position layers and anything clipped by an overflow ancestor. When several siblings
 *   overflow the same parent the parent is reported once (e.g. a nowrap flex row), which is where
 *   the fix usually goes.
 * - The overflow is masked: `overflow-x: hidden/clip` on html, body or an app root (up to four
 *   levels below body, as in `#root > .app > .editor`, full width, at least half the page tall)
 *   cuts the same culprits off at the viewport edge instead of letting the page scroll. That hides the symptom, not the bug, so it is reported the same way with the
 *   masking rule as evidence. Only culprits that start inside the viewport and carry text, a
 *   control or media count; aria-hidden decoration, transformed layers (carousels, off-canvas
 *   drawers) and anything clipped by a smaller container are left alone.
 *
 * Right-to-left pages (Arabic, Hebrew, Persian…) start at the right edge and overflow to the left,
 * so for them every "past the edge" test is mirrored: a culprit's left edge passes x = 0.
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
      const hides = (s) => s.overflowX === 'hidden' || s.overflowX === 'clip';
      const hs = M.style(html);
      const bs = M.style(body);
      const viewportMask = hides(hs) ? { selector: 'html', value: hs.overflowX } : hides(bs) ? { selector: 'body', value: bs.overflowX } : null;
      const docHeight = Math.max(html.scrollHeight, body.scrollHeight);
      const roots = new Map();
      // App shells nest: body > #root > .app > .editor. Only full-width, page-tall boxes qualify.
      const findRoots = (parent, depth) => {
        for (const n of parent.children) {
          if (M.inOverlay(n)) continue;
          const r = n.getBoundingClientRect();
          if (r.left > 1 || r.right < vw - 1 || r.height < docHeight / 2) continue;
          if (hides(M.style(n))) roots.set(n, { selector: M.cssPath(n), value: M.style(n).overflowX });
          if (depth < 4) findRoots(n, depth + 1);
        }
      };
      findRoots(body, 1);
      const scrolls = docWidth > vw + 1 && !viewportMask;
      if (!scrolls && !viewportMask && roots.size === 0) return [];

      const rtl = bs.direction === 'rtl';
      // How far a box (viewport rect) sticks out past the end edge, and whether it starts on screen.
      const past = (r) => (rtl ? -(r.left + scrollX) : r.right + scrollX - vw);
      const startsInside = (r) => (rtl ? r.right + scrollX > 1 : r.left + scrollX < vw - 1);
      const xClip = (s) => s.overflowX !== 'visible' || /paint|strict|content/.test(s.contain || '');
      // 'clipped' by a container, cut by a mask ({selector, value}), or 'none' (sticks out for real).
      const clipOf = (el) => {
        let mask = null;
        for (const c of M.clipChain(el)) {
          if (!xClip(M.style(c))) continue;
          if (!roots.has(c)) return 'clipped';
          mask = roots.get(c);
        }
        return mask || viewportMask || 'none';
      };
      const transformed = (el) => {
        for (let n = el; n && n !== body; n = n.parentElement) {
          const s = M.style(n);
          if ((s.transform && s.transform !== 'none') || (s.translate && s.translate !== 'none')) return true;
        }
        return false;
      };
      const hasContent = (el) => M.REPLACED.has(el.localName) || el.matches(M.TARGETS) ||
        !!el.querySelector(`${M.TARGETS}, img, svg, video, canvas, picture`) || /\S/.test(el.innerText || '');
      // Logo strips and tickers: a never-ending animation inside means the overflow is the design.
      const marquee = (el) => typeof el.getAnimations === 'function' &&
        el.getAnimations({ subtree: true }).some((a) => a.effect && a.effect.getComputedTiming().iterations === Infinity);
      // A masked culprit only matters when the user would see it cut: it starts on screen and has content.
      const visiblyCut = (el, r) => startsInside(r) && !M.ariaHidden(el) && !transformed(el) && !marquee(el) && hasContent(el);

      const over = new Set();
      const culprits = [];
      const skip = new Set(['script', 'style', 'template', 'noscript', 'link', 'meta']);
      let ignoredCulprit = false;
      for (const el of [body, ...body.querySelectorAll('*')]) {
        if (skip.has(el.localName) || M.inOverlay(el)) continue;
        if (M.ignored(el)) {
          const r = el.getBoundingClientRect();
          if (past(r) > 1) ignoredCulprit = true;
          continue;
        }
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        if (past(r) <= 1) continue;
        if (M.layerKind(el) === 'fixed' || M.visuallyHidden(el)) continue;
        const clip = el === body ? viewportMask || 'none' : clipOf(el);
        if (clip === 'clipped' || (clip === 'none' && !scrolls)) continue;
        over.add(el);
        if (el !== body && over.has(el.parentElement)) continue; // not outermost
        if (clip !== 'none' && !visiblyCut(el, r)) continue;
        culprits.push({ el, mask: clip === 'none' ? null : clip });
      }

      // Text that sticks out of its element (long unbreakable strings) has no element culprit.
      if (culprits.length === 0) {
        for (const t of M.textNodes(body, 8000)) {
          const owner = t.parentElement;
          if (M.layerKind(owner) === 'fixed' || M.visuallyHidden(owner)) continue;
          const clip = clipOf(owner);
          if (clip === 'clipped' || (clip === 'none' && !scrolls)) continue;
          if (clip !== 'none' && (M.ariaHidden(owner) || transformed(owner))) continue;
          const rects = M.textRects(t);
          if (rects.some((r) => past(r) > 1 && (clip === 'none' || startsInside(r)))) {
            if (!culprits.some((c) => c.el === owner)) culprits.push({ el: owner, mask: clip === 'none' ? null : clip });
            if (culprits.length >= 5) break;
          }
        }
      }

      if (culprits.length === 0 && (ignoredCulprit || !scrolls)) return [];
      const issues = [];
      const evidenceFor = (el, mask) => {
        const r = el.getBoundingClientRect();
        const s = M.style(el);
        return {
          viewportWidth: vw,
          documentWidth: docWidth,
          right: Math.round(r.right + scrollX),
          width: Math.round(r.width),
          overflowBy: Math.round(past(r)),
          ...(rtl ? { direction: 'rtl', edge: 'left' } : {}),
          cssWidth: s.width,
          minWidth: s.minWidth,
          whiteSpace: s.whiteSpace,
          position: s.position,
          ...(mask ? { maskedBy: mask.selector, maskValue: mask.value } : {}),
        };
      };
      const side = rtl ? 'left edge (right-to-left page)' : 'right edge';
      const masked = (mask) => (mask ? `; \`${mask.selector} { overflow-x: ${mask.value} }\` only hides the part that is cut off` : ', so the page scrolls horizontally');

      if (culprits.length === 0) {
        issues.push({
          type: 'page-overflow',
          severity: 'error',
          selector: 'html',
          rect: { x: rtl ? vw - docWidth : vw, y: 0, width: Math.max(1, docWidth - vw), height: Math.min(html.scrollHeight, 2000) },
          message: `The page is ${docWidth}px wide in a ${vw}px viewport and scrolls horizontally, but no single element could be blamed (check pseudo-elements and negative margins).`,
          evidence: { viewportWidth: vw, documentWidth: docWidth, ...(rtl ? { direction: 'rtl' } : {}) },
        });
        return issues;
      }

      // Group siblings that overflow the same parent.
      const byParent = new Map();
      for (const c of culprits) {
        const p = c.el === body ? null : c.el.parentElement;
        const key = p || c.el;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(c);
      }
      for (const [parent, list] of byParent) {
        if (list.length >= 2 && parent !== body && parent !== html) {
          const mask = list[0].mask;
          const sel = M.cssPath(parent);
          const ev = evidenceFor(parent, mask);
          ev.overflowBy = Math.round(Math.max(...list.map((c) => past(c.el.getBoundingClientRect()))));
          ev.children = list.slice(0, 6).map((c) => M.cssPath(c.el));
          issues.push({
            type: 'page-overflow',
            severity: 'error',
            selector: sel,
            rect: M.round(M.docRect(parent)),
            message: `${list.length} children of \`${sel}\` extend up to ${ev.overflowBy}px past the ${side} of the ${vw}px viewport${masked(mask)} (white-space: ${ev.whiteSpace}). Let the row wrap or shrink.`,
            evidence: ev,
          });
        } else {
          for (const { el, mask } of list) {
            const sel = M.cssPath(el);
            const ev = evidenceFor(el, mask);
            issues.push({
              type: 'page-overflow',
              severity: 'error',
              selector: sel,
              rect: M.round(M.docRect(el)),
              message: `\`${sel}\` is ${ev.width}px wide and extends ${ev.overflowBy}px past the ${side} of the ${vw}px viewport${masked(mask)}.`,
              evidence: ev,
            });
          }
        }
      }
      return issues;
    });
  },
};
