// Phone smoke test, run in CI before every release. Each page at 360px wide, in English and
// Vietnamese, must load without script errors, must not scroll sideways, and the cookie
// notice's button must be clickable.
// Usage: npm run check:ui   (expects the dev server on http://localhost:4351)
import { chromium } from 'playwright';

const BASE = process.env.ATLAS_URL || 'http://localhost:4351';
const PAGES = ['/', '/pricing.html', '/account.html'];
const LOCALES = ['en', 'vi'];

const browser = await chromium.launch();
const failures = [];
for (const locale of LOCALES) {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale });
  for (const route of PAGES) {
    const label = `${route} [${locale}]`;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    for (const message of errors) failures.push(`${label}: script error: ${message}`);
    const { scrollWidth, width } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, width: document.documentElement.clientWidth }));
    if (scrollWidth > width) failures.push(`${label}: page scrolls sideways (${scrollWidth}px of content on a ${width}px screen)`);
    try {
      await page.locator('.cookie button').click({ trial: true, timeout: 2000 });
    } catch {
      failures.push(`${label}: the cookie notice's button cannot be clicked`);
    }
    await page.close();
  }
  await context.close();
}
await browser.close();

if (failures.length) {
  console.error(`check:ui failed (${failures.length}):`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`check:ui passed: ${PAGES.length} pages × ${LOCALES.length} languages at 360px`);
