import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let axeSource = null;
function getAxeSource() {
  if (axeSource === null) axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  return axeSource;
}

/**
 * contrast (error): axe-core's `color-contrast` rule (WCAG 2 AA: 4.5:1, 3:1 for large text).
 * Only confirmed violations are reported; axe's "incomplete" results (text over images or
 * gradients, where the background cannot be computed) are not, to keep false positives out.
 * Elements failing with the same colors and the same required ratio share a root cause (one
 * color token), so they are reported as one issue listing every element.
 */
export default {
  name: 'contrast',
  phase: 'dom',
  async run(page) {
    const hasAxe = await page.evaluate(() => typeof window.axe === 'object' && typeof window.axe.run === 'function');
    if (!hasAxe) await page.evaluate(getAxeSource());
    return page.evaluate(async () => {
      const M = window.__mantis;
      M.reset();
      const result = await window.axe.run(document, {
        runOnly: { type: 'rule', values: ['color-contrast'] },
        resultTypes: ['violations'],
        elementRef: true,
        iframes: false,
      });
      const found = [];
      for (const v of result.violations) {
        for (const node of v.nodes) {
          const el = node.element;
          if (!el || M.ignored(el)) continue;
          const check = (node.any || []).find((c) => c.id === 'color-contrast') || (node.any || [])[0];
          const d = (check && check.data) || {};
          found.push({
            el,
            sel: M.cssPath(el),
            rect: M.round(M.visibleDocRect(el) || M.docRect(el)),
            text: M.snippet(el.innerText || el.textContent || '', 50),
            ratio: typeof d.contrastRatio === 'number' ? d.contrastRatio : null,
            expected: d.expectedContrastRatio || '4.5:1',
            fg: d.fgColor || null,
            bg: d.bgColor || null,
            fontSize: d.fontSize || null,
            fontWeight: d.fontWeight || null,
            target: node.target,
          });
        }
      }
      const groups = new Map();
      for (const f of found) {
        const key = `${f.fg}|${f.bg}|${f.expected}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(f);
      }
      const issues = [];
      for (const [key, group] of groups) {
        const f = group[0];
        const ratio = f.ratio !== null ? `${f.ratio.toFixed(2)}:1 ` : '';
        const evidence = {
          contrastRatio: f.ratio,
          expectedContrastRatio: f.expected,
          fgColor: f.fg,
          bgColor: f.bg,
          fontSize: f.fontSize,
          fontWeight: f.fontWeight,
          text: f.text,
          axeTarget: f.target,
        };
        if (group.length === 1) {
          issues.push({
            type: 'contrast',
            severity: 'error',
            selector: f.sel,
            rect: f.rect,
            message: `Low contrast ${ratio}(needs ${f.expected}): "${f.text}" — ${f.fg} on ${f.bg}, ${f.fontSize || '?'} ${f.fontWeight || ''}`.replace(/\s+$/, '') + '.',
            evidence,
          });
          continue;
        }
        issues.push({
          type: 'contrast',
          severity: 'error',
          dedupeKey: `contrast:${key}`,
          selector: f.sel,
          rect: f.rect,
          extraRects: group.slice(1, 40).map((g) => g.rect),
          message: `Low contrast ${ratio}(needs ${f.expected}): ${f.fg} on ${f.bg} in ${group.length} elements, e.g. ${group.slice(0, 3).map((g) => `"${g.text}"`).join(', ')}. One color token is probably behind all of them.`,
          evidence: { ...evidence, count: group.length, selectors: group.slice(0, 25).map((g) => g.sel) },
        });
      }
      return issues;
    });
  },
};
