/**
 * tap-target (warn, phone-sized viewports only): interactive elements smaller than 24x24 CSS px
 * (WCAG 2.2 SC 2.5.8 Target Size, Minimum).
 *
 * Follows the SC's exceptions so the result matches what an auditor would flag:
 * - inline: links that sit inside running text (display: inline with sibling text) are skipped;
 * - spacing: an undersized target passes when a 24px circle centred on it does not intersect
 *   another target or another undersized target's circle;
 * - equivalent: checkboxes/radios with a <label> (the label is also a target) are skipped.
 * Disabled, hidden, transparent and visually-hidden (<= 2px) controls are ignored.
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
        if (M.inOverlay(el) || !M.isRendered(el) || M.effectiveOpacity(el) < 0.1) continue;
        if (el.matches(':disabled') || el.closest('[inert]')) continue;
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
      const issues = [];
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
        const sel = M.cssPath(s.el);
        const near = M.cssPath(nearest.el);
        const w = Math.round(s.r.width);
        const h = Math.round(s.r.height);
        issues.push({
          type: 'tap-target',
          severity: 'warn',
          selector: sel,
          rect: M.round(s.r),
          message: `Tap target \`${sel}\` is ${w}x${h}px (minimum 24x24) and sits too close to \`${near}\` to pass the spacing exception (WCAG 2.5.8).`,
          evidence: { width: w, height: h, nearest: near, label: M.snippet(s.el.getAttribute('aria-label') || s.el.innerText || '', 40) },
        });
      }
      return issues;
    });
  },
};
