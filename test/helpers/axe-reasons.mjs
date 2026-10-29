// Debug helper: print axe color-contrast results (violations and incomplete reasons) for an HTML file.
// Usage: node test/helpers/axe-reasons.mjs <file.html> [light|dark]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const [file, scheme = 'light'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ colorScheme: scheme, viewport: { width: 1000, height: 700 } });
await page.setContent(readFileSync(file, 'utf8'));
await page.evaluate(readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'));
const r = await page.evaluate(async () => {
  const res = await window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations', 'incomplete', 'passes'] });
  const f = (kind) => (x) => x.nodes.map((n) => `${kind} ${n.target.join(' ')} key=${(n.any[0] && n.any[0].data && n.any[0].data.messageKey) || '-'} ratio=${n.any[0] && n.any[0].data && n.any[0].data.contrastRatio}`);
  return [...res.violations.flatMap(f('V')), ...res.incomplete.flatMap(f('I')), ...res.passes.flatMap(f('P'))];
});
console.log(r.join('\n'));
await browser.close();
