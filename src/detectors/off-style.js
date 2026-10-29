import { collectStyle } from '../inpage/style.js';
import { offStyleIssues } from '../style.js';

/**
 * off-style (warning): runs only when a house style was learned (`mantis learn`, or `--style`).
 * Flags colors within ΔE2000 5 of a house color without being one, font sizes and corner radii a
 * hair off the house values, and fonts the app uses nowhere else. Far-off values are left alone.
 */
export default {
  name: 'off-style',
  phase: 'dom',
  applies: (ctx) => !!ctx.options.styleData,
  async run(page, ctx) {
    const data = await page.evaluate(collectStyle, { tokens: false, examples: 6 });
    return offStyleIssues(ctx.options.styleData, ctx.cell.scheme, data);
  },
};
