/**
 * overlap (error): things on top of each other that should not be.
 *
 * (a) Interactive elements (a[href], button, input, select, textarea, [role=button]) whose
 *     visible rects (after overflow clipping) intersect by at least 4x4 px. Skipped: nested
 *     elements, fully transparent ones, a control drawn inside a form field (search/clear
 *     adornments), and pairs where only one side lives in a position:fixed layer (overlays such
 *     as cookie bars and chat bubbles are meant to float over content). A hit test at the
 *     intersection confirms both are really painted there.
 * (b) Text covered by another element: points sampled along each text line are hit-tested
 *     (document.elementsFromPoint, scrolling the page window by window). Text counts as covered
 *     when an element that is not its ancestor/descendant is on top at that point and actually
 *     paints there (opaque-ish background, image, SVG or its own text) — transparent wrappers
 *     such as "stretched link" pseudo-elements are ignored. Fixed/sticky layers are only
 *     considered at scroll position 0, where they sit over the content as the user first sees it,
 *     and a fixed layer only when it is a bar pinned to the top (content hidden under a fixed
 *     header); bottom bars, chat bubbles and cookie banners float over content by design.
 *     A pair needs at least 2 covered sample points or 20% of the text's points.
 */
export default {
  name: 'overlap',
  phase: 'dom',
  async run(page) {
    return page.evaluate(() => {
      const M = window.__mantis;
      M.reset();
      const issues = [];
      const startX = scrollX;
      const startY = scrollY;
      const scrollToY = (y) => window.scrollTo({ left: 0, top: y, behavior: 'instant' });
      scrollToY(0);
      const vh = innerHeight;
      const vw = innerWidth;

      // ---------- (a) interactive pairs ----------
      const targets = [];
      for (const el of document.querySelectorAll(M.INTERACTIVE)) {
        if (targets.length >= 600) break;
        if (M.inOverlay(el) || !M.isRendered(el) || M.effectiveOpacity(el) < 0.1) continue;
        const vr = M.visibleDocRect(el);
        if (!vr || vr.width < 1 || vr.height < 1) continue;
        targets.push({ el, r: vr, layer: M.layerKind(el) });
      }
      const isField = (el) => /^(input|textarea|select)$/.test(el.localName);
      const contains = (a, b) => a.x <= b.x + 1 && a.y <= b.y + 1 && a.x + a.width >= b.x + b.width - 1 && a.y + a.height >= b.y + b.height - 1;
      const pairs = [];
      for (let i = 0; i < targets.length; i++) {
        for (let j = i + 1; j < targets.length; j++) {
          const A = targets[i];
          const B = targets[j];
          if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
          if ((A.layer === 'fixed') !== (B.layer === 'fixed')) continue;
          const x1 = Math.max(A.r.x, B.r.x);
          const y1 = Math.max(A.r.y, B.r.y);
          const x2 = Math.min(A.r.x + A.r.width, B.r.x + B.r.width);
          const y2 = Math.min(A.r.y + A.r.height, B.r.y + B.r.height);
          if (x2 - x1 < 4 || y2 - y1 < 4) continue;
          if ((isField(A.el) && contains(A.r, B.r)) || (isField(B.el) && contains(B.r, A.r))) continue;
          if (A.el.localName === 'label' || B.el.localName === 'label') continue;
          pairs.push({ A, B, x1, y1, x2, y2 });
        }
      }
      const reported = [];
      for (const p of pairs) {
        const cx = (p.x1 + p.x2) / 2;
        const cy = (p.y1 + p.y2) / 2;
        const fixed = p.A.layer !== 'flow' || p.B.layer !== 'flow';
        if (fixed && cy > vh) continue;
        const top = fixed ? 0 : Math.max(0, cy - vh / 2);
        scrollToY(top);
        const px = cx - scrollX;
        const py = cy - scrollY;
        if (px < 0 || px >= vw || py < 0 || py >= vh) continue;
        const stack = document.elementsFromPoint(px, py);
        const idxA = stack.findIndex((e) => e === p.A.el || p.A.el.contains(e));
        const idxB = stack.findIndex((e) => e === p.B.el || p.B.el.contains(e));
        if (idxA < 0 || idxB < 0) continue;
        const [upper, lower] = idxA <= idxB ? [p.A, p.B] : [p.B, p.A];
        const sel = M.cssPath(upper.el);
        const withSel = M.cssPath(lower.el);
        reported.push([upper.el, lower.el]);
        const w = Math.round(p.x2 - p.x1);
        const h = Math.round(p.y2 - p.y1);
        issues.push({
          type: 'overlap',
          severity: 'error',
          key: `pair:${withSel}`,
          selector: sel,
          rect: M.round(upper.r),
          message: `Interactive elements overlap: \`${sel}\` sits on top of \`${withSel}\` (${w}x${h}px intersect), so taps can hit the wrong control.`,
          evidence: { with: withSel, intersection: { x: Math.round(p.x1), y: Math.round(p.y1), width: w, height: h } },
        });
      }

      // ---------- (b) covered text ----------
      const paints = (E, x, y) => {
        if (E instanceof SVGElement) return true;
        if (M.REPLACED.has(E.localName)) return true;
        const s = M.style(E);
        if (s.backgroundImage && s.backgroundImage !== 'none') return true;
        const bg = M.parseColor(s.backgroundColor);
        if (bg && bg[3] >= 0.3) return true;
        for (const c of E.childNodes) {
          if (c.nodeType === 3 && c.nodeValue.trim()) {
            for (const r of M.textRects(c)) {
              if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
            }
          }
        }
        return false;
      };

      // Sample at scroll 0 so fixed/sticky text has its "as first seen" position.
      scrollToY(0);
      const samples = []; // {owner, text, x, y (doc), layer}
      const perOwner = new Map();
      let budget = 4000;
      for (const t of M.textNodes(document.body, 2500)) {
        if (budget <= 0) break;
        const owner = t.parentElement;
        if (!M.isRendered(owner) || M.effectiveOpacity(owner) < 0.1) continue;
        if (M.visuallyHidden(owner)) continue;
        const rects = M.textRects(t).slice(0, 6);
        if (!rects.length) continue;
        const layer = M.layerKind(owner);
        for (const r of rects) {
          const vis = M.clipTextRect(owner, r);
          if (!vis) continue;
          const y = (r.top + r.bottom) / 2;
          if (y <= vis.top + 1 || y >= vis.bottom - 1) continue;
          for (const f of [0.1, 0.3, 0.5, 0.7, 0.9]) {
            const x = r.left + f * (r.right - r.left);
            if (x <= vis.left + 1 || x >= vis.right - 1) continue;
            samples.push({ owner, text: t.nodeValue, x: x + scrollX, y: y + scrollY, layer });
            budget--;
            let o = perOwner.get(owner);
            if (!o) {
              o = { total: 0 };
              perOwner.set(owner, o);
            }
            o.total++;
          }
        }
      }

      // A fixed layer only counts as "covering" when it is a bar pinned to the top of the viewport
      // (a header hiding the content under it); bottom bars, chat bubbles and cookie banners are
      // overlays by design.
      const fixedRoot = (el) => {
        let root = null;
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) if (M.style(n).position === 'fixed') root = n;
        return root;
      };
      const isTopBar = (el) => {
        const root = fixedRoot(el);
        if (!root) return true;
        const r = root.getBoundingClientRect();
        return r.top <= 2 && r.width >= innerWidth * 0.5 && r.height <= innerHeight * 0.4;
      };
      const covered = new Map(); // "coverer|owner" -> record
      const docH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const step = Math.max(200, vh - 40);
      const pending = samples.slice();
      for (let top = 0; pending.length && top < docH + vh; top += step) {
        scrollToY(top);
        const sy = scrollY;
        for (let i = pending.length - 1; i >= 0; i--) {
          const s = pending[i];
          let px;
          let py;
          if (s.layer !== 'flow') {
            if (sy !== 0) {
              pending.splice(i, 1);
              continue;
            }
            px = s.x;
            py = s.y;
          } else {
            px = s.x - scrollX;
            py = s.y - sy;
          }
          if (py < 2 || py > vh - 2) continue;
          pending.splice(i, 1);
          if (px < 0 || px >= vw) continue;
          const stack = document.elementsFromPoint(px, py);
          for (const E of stack) {
            if (E === s.owner || s.owner.contains(E)) break;
            if (E.contains(s.owner)) break;
            if (M.inOverlay(E)) continue;
            const layer = M.layerKind(E);
            if (sy > 0 && layer !== 'flow') continue;
            if (layer === 'fixed' && !isTopBar(E)) continue;
            if (M.effectiveOpacity(E) < 0.15) continue;
            if (!paints(E, px, py)) continue;
            const key = M.structKey(E) + '|' + M.structKey(s.owner);
            let rec = covered.get(key);
            if (!rec) {
              rec = { E, owner: s.owner, points: 0, text: s.text };
              covered.set(key, rec);
            }
            rec.points++;
            break;
          }
        }
        if (top > docH) break;
      }
      scrollToY(0);

      for (const rec of covered.values()) {
        const total = perOwner.get(rec.owner)?.total || 1;
        if (rec.points < 2 && rec.points / total < 0.2) continue;
        if (reported.some(([u, l]) => (u === rec.E || u.contains(rec.E)) && (l === rec.owner || l.contains(rec.owner)))) continue;
        const sel = M.cssPath(rec.E);
        const target = rec.owner.closest(M.INTERACTIVE) || rec.owner;
        const withSel = M.cssPath(target);
        const r = M.visibleDocRect(rec.E) || M.docRect(rec.E);
        issues.push({
          type: 'overlap',
          severity: 'error',
          key: `covers:${withSel}`,
          selector: sel,
          rect: M.round(r),
          message: `\`${sel}\` covers the text "${M.snippet(rec.text, 50)}" of \`${withSel}\` (${rec.points} of ${total} sampled points hidden).`,
          evidence: { with: withSel, coveredPoints: rec.points, sampledPoints: total, text: M.snippet(rec.text, 80) },
        });
      }

      window.scrollTo({ left: startX, top: startY, behavior: 'instant' });
      return issues;
    });
  },
};
