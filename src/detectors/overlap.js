/**
 * overlap (error): things on top of each other that should not be.
 *
 * (a) Interactive elements (a[href], button, input, select, textarea, [role=button]) whose
 *     visible rects (after overflow clipping) intersect by at least 4x4 px, where hit testing
 *     shows that both actually paint inside the intersection (background, border, text, icon).
 *     Overlapping transparent padding (the negative-margin trick for big icon hit areas) is not
 *     reported. Also skipped: nested elements, fully transparent or off-screen ones, a control
 *     drawn inside a form field (search/clear adornments), a small control drawn on a media tile
 *     (an ALT, play or zoom pill over a link or button that shows only an image or video),
 *     identical siblings (card decks, avatar
 *     stacks) and pairs where only one side lives in a position:fixed layer (overlays such as
 *     cookie bars and chat bubbles are meant to float over content).
 * (b) Text covered by another element: points sampled along each text line are hit-tested
 *     (document.elementsFromPoint, scrolling the page window by window). Text counts as covered
 *     when an element that is not its ancestor/descendant is on top at that point and paints
 *     there — transparent wrappers such as "stretched link" pseudo-elements are ignored.
 *     Fixed/sticky layers are only considered at scroll position 0, where they sit over the
 *     content as the user first sees it, and a fixed layer only when it is a bar pinned to the
 *     top (content hidden under a fixed header). Not reported: text that hit testing cannot see
 *     (pointer-events: none), aria-hidden decorative text, a duplicate copy of the same text
 *     drawn on top (layered text effects), and cards stacked on purpose (coverer and text sit in
 *     sibling subtrees of the same kind, and the covering one is absolutely positioned or
 *     transformed). A pair needs at least 2 covered sample points or 20% of the text's points;
 *     findings are grouped per covering element.
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
      const owns = (root, e) => e === root || root.contains(e);

      // ---------- (a) interactive pairs ----------
      const targets = [];
      for (const el of document.querySelectorAll(M.INTERACTIVE)) {
        if (targets.length >= 600) break;
        if (M.ignored(el) || !M.isRendered(el) || M.effectiveOpacity(el) < 0.1 || M.offscreen(el)) continue;
        const vr = M.visibleDocRect(el);
        if (!vr || vr.width < 1 || vr.height < 1) continue;
        targets.push({ el, r: vr, layer: M.layerKind(el), sig: M.signature(el) });
      }
      const isField = (el) => /^(input|textarea|select)$/.test(el.localName);
      const contains = (a, b) => a.x <= b.x + 1 && a.y <= b.y + 1 && a.x + a.width >= b.x + b.width - 1 && a.y + a.height >= b.y + b.height - 1;
      const isMediaTile = (el) => !!el.querySelector('img, video, picture, canvas') && !(el.innerText || '').trim();
      const onMedia = (tile, pill) => isMediaTile(tile.el) && contains(tile.r, pill.r) && pill.r.width * pill.r.height < 0.25 * tile.r.width * tile.r.height;
      const pairs = [];
      for (let i = 0; i < targets.length; i++) {
        for (let j = i + 1; j < targets.length; j++) {
          const A = targets[i];
          const B = targets[j];
          if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
          if ((A.layer === 'fixed') !== (B.layer === 'fixed')) continue;
          // Identical siblings stacked on purpose: card decks, avatar stacks, fanned screenshots.
          if (A.el.parentElement === B.el.parentElement && A.sig === B.sig) continue;
          const x1 = Math.max(A.r.x, B.r.x);
          const y1 = Math.max(A.r.y, B.r.y);
          const x2 = Math.min(A.r.x + A.r.width, B.r.x + B.r.width);
          const y2 = Math.min(A.r.y + A.r.height, B.r.y + B.r.height);
          if (x2 - x1 < 4 || y2 - y1 < 4) continue;
          if ((isField(A.el) && contains(A.r, B.r)) || (isField(B.el) && contains(B.r, A.r))) continue;
          if (onMedia(A, B) || onMedia(B, A)) continue;
          pairs.push({ A, B, x1, y1, x2, y2 });
        }
      }
      const reported = [];
      for (const p of pairs) {
        const fixed = p.A.layer !== 'flow' || p.B.layer !== 'flow';
        const cy = (p.y1 + p.y2) / 2;
        if (fixed && cy > vh) continue;
        scrollToY(fixed ? 0 : Math.max(0, cy - vh / 2));
        const w = p.x2 - p.x1;
        const h = p.y2 - p.y1;
        const points = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]];
        let hit = null;
        for (const [fx, fy] of points) {
          const px = p.x1 + fx * w - scrollX;
          const py = p.y1 + fy * h - scrollY;
          if (px < 0 || px >= vw || py < 0 || py >= vh) continue;
          const stack = document.elementsFromPoint(px, py);
          const ia = stack.findIndex((e) => owns(p.A.el, e));
          const ib = stack.findIndex((e) => owns(p.B.el, e));
          if (ia < 0 || ib < 0) continue;
          // Both must put pixels here; overlapping transparent padding is invisible to users.
          const paintsA = stack.slice(ia).some((e) => owns(p.A.el, e) && M.paintsAt(e, px, py));
          const paintsB = stack.slice(ib).some((e) => owns(p.B.el, e) && M.paintsAt(e, px, py));
          if (paintsA && paintsB) {
            hit = ia <= ib ? [p.A, p.B] : [p.B, p.A];
            break;
          }
        }
        if (!hit) continue;
        const [upper, lower] = hit;
        const sel = M.cssPath(upper.el);
        const withSel = M.cssPath(lower.el);
        reported.push([upper.el, lower.el]);
        issues.push({
          type: 'overlap',
          severity: 'error',
          key: `pair:${withSel}`,
          selector: sel,
          rect: M.round(upper.r),
          message: `Interactive elements overlap: \`${sel}\` sits on top of \`${withSel}\` (${Math.round(w)}x${Math.round(h)}px intersect), so taps can hit the wrong control.`,
          evidence: { with: withSel, intersection: { x: Math.round(p.x1), y: Math.round(p.y1), width: Math.round(w), height: Math.round(h) } },
        });
      }

      // ---------- (b) covered text ----------
      // Sample at scroll 0 so fixed/sticky text has its "as first seen" position.
      scrollToY(0);
      const samples = []; // {owner, text, x, y (doc), layer}
      const perOwner = new Map();
      let budget = 4000;
      for (const t of M.textNodes(document.body, 2500)) {
        if (budget <= 0) break;
        const owner = t.parentElement;
        if (!M.isRendered(owner) || M.effectiveOpacity(owner) < 0.1) continue;
        if (M.visuallyHidden(owner) || M.offscreen(owner) || M.ariaHidden(owner)) continue;
        // Hit testing cannot see pointer-events:none elements (hints drawn inside inputs, labels
        // over controls), so their text can never be judged as covered or not.
        if (M.style(owner).pointerEvents === 'none') continue;
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
            perOwner.set(owner, (perOwner.get(owner) || 0) + 1);
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
      // Cards stacked on purpose: coverer and text live in sibling subtrees of the same kind (same
      // tag, a shared class) and the covering one was placed deliberately (absolute or
      // transformed). Cards that collide in normal flow are still reported.
      const sameKind = (x, y) => {
        if (x.localName !== y.localName) return false;
        if (!x.classList.length && !y.classList.length) return true;
        return [...x.classList].some((c) => y.classList.contains(c));
      };
      const placed = (el) => {
        const s = M.style(el);
        return s.position === 'absolute' || s.position === 'fixed' || (s.transform && s.transform !== 'none') || (s.translate && s.translate !== 'none');
      };
      const stackedSiblings = (a, b) => {
        let ca = a;
        while (ca.parentElement && !ca.parentElement.contains(b)) ca = ca.parentElement;
        const lca = ca.parentElement;
        if (!lca) return false;
        let cb = b;
        while (cb.parentElement && cb.parentElement !== lca) cb = cb.parentElement;
        return ca !== cb && sameKind(ca, cb) && placed(ca);
      };
      const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

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
            if (M.ignored(E)) continue;
            const layer = M.layerKind(E);
            if (sy > 0 && layer !== 'flow') continue;
            if (layer === 'fixed' && !isTopBar(E)) continue;
            if (M.effectiveOpacity(E) < 0.15) continue;
            if (!M.paintsAt(E, px, py)) continue;
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

      const byCoverer = new Map();
      for (const rec of covered.values()) {
        const total = perOwner.get(rec.owner) || 1;
        if (rec.points < 2 && rec.points / total < 0.2) continue;
        if (reported.some(([u, l]) => owns(u, rec.E) && owns(l, rec.owner))) continue;
        if (norm(rec.E.textContent) && norm(rec.E.textContent) === norm(rec.owner.textContent)) continue; // duplicate text layer
        if (stackedSiblings(rec.E, rec.owner)) continue;
        if (!byCoverer.has(rec.E)) byCoverer.set(rec.E, []);
        byCoverer.get(rec.E).push({ ...rec, total });
      }
      for (const [E, recs] of byCoverer) {
        const sel = M.cssPath(E);
        const first = recs[0];
        const target = first.owner.closest(M.INTERACTIVE) || first.owner;
        const withSel = M.cssPath(target);
        const r = M.visibleDocRect(E) || M.docRect(E);
        const points = recs.reduce((n, x) => n + x.points, 0);
        const sampled = recs.reduce((n, x) => n + x.total, 0);
        issues.push({
          type: 'overlap',
          severity: 'error',
          key: 'covers',
          selector: sel,
          rect: M.round(r),
          message: recs.length === 1
            ? `\`${sel}\` covers the text "${M.snippet(first.text, 50)}" of \`${withSel}\` (${points} of ${sampled} sampled points hidden).`
            : `\`${sel}\` covers the text of ${recs.length} elements, e.g. "${M.snippet(first.text, 40)}" in \`${withSel}\` (${points} of ${sampled} sampled points hidden).`,
          evidence: {
            with: withSel,
            coveredPoints: points,
            sampledPoints: sampled,
            text: M.snippet(first.text, 80),
            ...(recs.length > 1 ? { count: recs.length, covered: recs.slice(0, 10).map((x) => M.cssPath(x.owner)) } : {}),
          },
        });
      }

      window.scrollTo({ left: startX, top: startY, behavior: 'instant' });
      return issues;
    });
  },
};
