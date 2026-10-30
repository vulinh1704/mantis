// Phone smoke test, run before every release. The first screen at 360px wide, in English and
// German, must load without script errors, show every welcome-menu label in full, and have
// nothing covering the buttons in the bottom bar.
// Usage: yarn check:ui   (expects the dev server on http://localhost:3001)
import { chromium } from "playwright";

const BASE = process.env.APP_URL || "http://localhost:3001";
const LOCALES = ["en", "de"];

const browser = await chromium.launch();
const failures = [];
for (const locale of LOCALES) {
  const label = `[${locale}]`;
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
    locale,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForSelector(".excalidraw .App-bottom-bar");
  await page.waitForTimeout(1500);
  for (const message of errors) {
    failures.push(`${label} script error: ${message}`);
  }
  const cut = await page.$$eval(".welcome-screen-menu-item__text", (els) =>
    els
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => el.textContent.trim()),
  );
  for (const text of cut) {
    failures.push(`${label} welcome menu label is cut off: "${text}"`);
  }
  const covered = await page.$$eval(".App-bottom-bar button", (els) =>
    els
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        if (!hit || el.contains(hit)) {
          return null;
        }
        const name = el.getAttribute("aria-label") || el.title || "a button";
        const by = hit.closest("button")?.getAttribute("aria-label") || hit.tagName.toLowerCase();
        return `"${name}" is covered by ${by}`;
      })
      .filter(Boolean),
  );
  for (const message of covered) {
    failures.push(`${label} bottom bar: ${message}`);
  }
  await context.close();
}
await browser.close();

if (failures.length) {
  console.error(`check:ui failed (${failures.length}):`);
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exit(1);
}
console.log(`check:ui passed: the first screen × ${LOCALES.length} languages at 360px`);
