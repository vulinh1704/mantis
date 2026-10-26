/**
 * tap-target (warn, phone-sized viewports only): interactive elements smaller than 24x24 CSS px
 * (WCAG 2.2 SC 2.5.8 Target Size, Minimum).
 *
 * Follows the SC's exceptions so the result matches what an auditor would flag:
 * - inline: links that sit inside running text (display: inline with sibling text) are skipped;
 * - spacing: an undersized target passes when a 24px circle centred on it does not intersect
 *   another target or another undersized target's circle;
 * - equivalent: checkboxes/radios with a <label> (the label is also a target) are skipped.
 * Disabled, hidden, off-screen, transparent and visually-hidden (<= 2px) controls are ignored.
 * Three or more failing targets of the same kind (tag + classes) are grouped into one warning.
 */
export default {
  name: 'tap-target',
  phase: 'dom',
  applies(ctx) {
    return ctx.cell.viewport.width < 600;
  },
  async run(page) {
    return page.evaluate(() => {
      const M = window.__mantis;
      M.reset();
      const MIN = 24;
      const all = [];
      for (const el of document.querySelectorAll(M.TARGETS)) {
        if (M.ignored(el) || !M.isRendered(el) || M.effectiveOpacity(el) < 0.1) continue;
        if (el.matches(':disabled') || el.closest('[inert]') || M.offscreen(el)) continue;
        const r = M.docRect(el);
        if (r.width <= 2 || r.height <= 2) continue;
        if (!M.visibleDocRect(el)) continue;
        all.push({ el, r });
      }
      const inlineInText = (el) => {
        if (M.style(el).display !== 'inline') return false;
        const parent = el.parentElement;
        if (!parent) return false;
        for (const n of parent.childNodes) {
          if (n !== el && n.nodeType === 3 && n.nodeValue.trim()) return true;
        }
        // Text in other inline siblings (e.g. <span>) also makes it a sentence.
        const text = (parent.textContent || '').replace(/\s+/g, ' ').trim();
        const own = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return text.length > own.length + 3 && M.style(parent).display !== 'flex' && M.style(parent).display !== 'grid';
      };
      const labelled = (el) => el.localName === 'input' && /^(checkbox|radio)$/.test(el.type) && el.labels && el.labels.length > 0;

      const small = all.filter(({ el, r }) => (r.width < MIN || r.height < MIN) && !inlineInText(el) && !labelled(el));
      const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
      const distToRect = (p, r) => {
        const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
        const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
        return Math.hypot(dx, dy);
      };
      const failing = [];
      for (const s of small) {
        const c = center(s.r);
        let nearest = null;
        let nearestDist = Infinity;
        for (const o of all) {
          if (o === s || o.el.contains(s.el) || s.el.contains(o.el)) continue;
          const isSmall = small.includes(o);
          const d = isSmall ? Math.hypot(center(o.r).x - c.x, center(o.r).y - c.y) - MIN / 2 : distToRect(c, o.r);
          if (d < MIN / 2 && d < nearestDist) {
            nearest = o;
            nearestDist = d;
          }
        }
        if (!nearest) continue; // spacing exception
        failing.push({
          el: s.el,
          sel: M.cssPath(s.el),
          near: M.cssPath(nearest.el),
          rect: M.round(s.r),
          w: Math.round(s.r.width),
          h: Math.round(s.r.height),
          sig: M.signature(s.el).replace(/#[^.]*/, ''),
          label: M.snippet(s.el.getAttribute('aria-label') || s.el.innerText || '', 40),
        });
      }

      const issues = [];
      const bySig = new Map();
      for (const f of failing) {
        if (!bySig.has(f.sig)) bySig.set(f.sig, []);
        bySig.get(f.sig).push(f);
      }
      for (const [sig, group] of bySig) {
        if (group.length >= 3) {
          const first = group[0];
          const sizes = [...new Set(group.map((g) => `${g.w}x${g.h}`))];
          issues.push({
            type: 'tap-target',
            severity: 'warn',
            dedupeKey: `tap:${sig}`,
            selector: first.sel,
            rect: first.rect,
            extraRects: group.slice(1, 40).map((g) => g.rect),
            message: `${group.length} tap targets like \`${first.sel}\` are ${sizes.slice(0, 3).join(', ')}px (minimum 24x24) and packed too close together to pass the spacing exception (WCAG 2.5.8).`,
            evidence: { count: group.length, sizes, selectors: group.slice(0, 20).map((g) => g.sel), nearest: first.near },
          });
          continue;
        }
        for (const f of group) {
          issues.push({
            type: 'tap-target',
            severity: 'warn',
            selector: f.sel,
            rect: f.rect,
            message: `Tap target \`${f.sel}\` is ${f.w}x${f.h}px (minimum 24x24) and sits too close to \`${f.near}\` to pass the spacing exception (WCAG 2.5.8).`,
            evidence: { width: f.w, height: f.h, nearest: f.near, label: f.label },
          });
        }
      }
      return issues;
    });
  },
};
