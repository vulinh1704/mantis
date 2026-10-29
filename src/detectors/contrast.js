import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { contrastRatio, over, toHex } from '../color.js';
import { capturePixels, dominantColor, hasColorNear } from '../pixels.js';

const require = createRequire(import.meta.url);
let axeSource = null;
function getAxeSource() {
  if (axeSource === null) axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  return axeSource;
}

/**
 * contrast (error): axe-core's `color-contrast` rule (WCAG 2 AA: 4.5:1, 3:1 for large text).
 *
 * Confirmed violations are reported as they are. Of axe's "incomplete" results, two kinds are
 * measured: text whose background axe could not compute because other layers sit on top of it
 * (`bgOverlap`), or because a replaced element such as a <canvas> is behind it (`imgNode`). That
 * is every label on canvas apps (whiteboards, maps, editors). For those, the background is read
 * from a screenshot: the most common color in the text's box, when it covers at least half of it
 * (busy photos and gradients are skipped), and only when glyphs in the text color are actually
 * painted there (text hidden under an opaque layer is not this detector's business). CSS
 * background images and gradients stay unreported, to keep false positives out.
 *
 * Elements failing with the same colors and the same required ratio share a root cause (one
 * color token), so they are reported as one issue listing every element.
 */
export default {
  name: 'contrast',
  phase: 'dom',
  async run(page) {
    const hasAxe = await page.evaluate(() => typeof window.axe === 'object' && typeof window.axe.run === 'function');
    if (!hasAxe) await page.evaluate(getAxeSource());
    const { found, covered } = await page.evaluate(async () => {
      const M = window.__mantis;
      M.reset();
      const result = await window.axe.run(document, {
        runOnly: { type: 'rule', values: ['color-contrast'] },
        resultTypes: ['violations', 'incomplete'],
        elementRef: true,
        iframes: false,
      });
      const describe = (node) => {
        const el = node.element;
        const check = (node.any || []).find((c) => c.id === 'color-contrast') || (node.any || [])[0];
        const d = (check && check.data) || {};
        return {
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
          messageKey: d.messageKey || null,
        };
      };
      const found = [];
      for (const v of result.violations) {
        for (const node of v.nodes) {
          if (node.element && !M.ignored(node.element)) found.push(describe(node));
        }
      }
      const covered = [];
      for (const v of result.incomplete) {
        for (const node of v.nodes) {
          const el = node.element;
          if (!el || M.ignored(el)) continue;
          const f = describe(node);
          if (f.messageKey !== 'bgOverlap' && f.messageKey !== 'imgNode') continue;
          const opacity = M.effectiveOpacity(el);
          if (opacity < 0.1) continue;
          const c = M.parseColor(M.style(el).color);
          if (!c) continue;
          covered.push({ ...f, color: [c[0], c[1], c[2], (c[3] ?? 1) * opacity] });
        }
      }
      return { found, covered };
    });

    if (covered.length) {
      const img = await capturePixels(page);
      for (const f of covered) {
        const bg = dominantColor(img, f.rect);
        // Busy background (image, gradient), or no glyph painted at all (covered): not measurable.
        if (!bg || bg.share < 0.5 || bg.share > 0.99) continue;
        const fg = over(f.color, bg.color);
        if (!hasColorNear(img, f.rect, fg)) continue;
        const ratio = Math.round(contrastRatio(fg, bg.color) * 100) / 100;
        if (ratio >= parseFloat(f.expected)) continue;
        found.push({ ...f, ratio, fg: toHex(fg), bg: toHex(bg.color), measured: 'pixels' });
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
      const how = f.measured ? ' The background was read from the screenshot: other layers cover this text, so the page code cannot tell it.' : '';
      const evidence = {
        contrastRatio: f.ratio,
        expectedContrastRatio: f.expected,
        fgColor: f.fg,
        bgColor: f.bg,
        fontSize: f.fontSize,
        fontWeight: f.fontWeight,
        text: f.text,
        axeTarget: f.target,
        ...(f.measured ? { background: 'pixels' } : {}),
      };
      if (group.length === 1) {
        issues.push({
          type: 'contrast',
          severity: 'error',
          selector: f.sel,
          rect: f.rect,
          message: `Low contrast ${ratio}(needs ${f.expected}): "${f.text}" — ${f.fg} on ${f.bg}, ${f.fontSize || '?'} ${f.fontWeight || ''}`.replace(/\s+$/, '') + '.' + how,
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
        message: `Low contrast ${ratio}(needs ${f.expected}): ${f.fg} on ${f.bg} in ${group.length} elements, e.g. ${group.slice(0, 3).map((g) => `"${g.text}"`).join(', ')}. One color token is probably behind all of them.${how}`,
        evidence: { ...evidence, count: group.length, selectors: group.slice(0, 25).map((g) => g.sel) },
      });
    }
    return issues;
  },
};
