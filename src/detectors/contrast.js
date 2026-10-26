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
      const issues = [];
      const hex = (c) => (typeof c === 'string' ? c : '');
      for (const v of result.violations) {
        for (const node of v.nodes) {
          const el = node.element;
          if (!el || M.inOverlay(el)) continue;
          const check = (node.any || []).find((c) => c.id === 'color-contrast') || (node.any || [])[0];
          const d = (check && check.data) || {};
          const sel = M.cssPath(el);
          const text = M.snippet(el.innerText || el.textContent || '', 50);
          const ratio = typeof d.contrastRatio === 'number' ? d.contrastRatio : null;
          const expected = d.expectedContrastRatio || '4.5:1';
          issues.push({
            type: 'contrast',
            severity: 'error',
            selector: sel,
            rect: M.round(M.visibleDocRect(el) || M.docRect(el)),
            message: `Low contrast ${ratio !== null ? ratio.toFixed(2) + ':1' : ''} (needs ${expected}): "${text}" — ${hex(d.fgColor)} on ${hex(d.bgColor)}, ${d.fontSize || '?'} ${d.fontWeight || ''}`.replace(/\s+$/, '') + '.',
            evidence: {
              contrastRatio: ratio,
              expectedContrastRatio: expected,
              fgColor: d.fgColor || null,
              bgColor: d.bgColor || null,
              fontSize: d.fontSize || null,
              fontWeight: d.fontWeight || null,
              text,
              axeTarget: node.target,
            },
          });
        }
      }
      return issues;
    });
  },
};
