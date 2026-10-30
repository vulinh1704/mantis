// Hidden grader for the Excalidraw benchmark. It checks each of the 7 planted bugs (X1-X7, see
// excalidraw-plant.mjs) on the first screen with its own Playwright assertions, never Mantis's
// detectors, plus cover-up and regression checks. The agent never sees this file.
//
// A cover-up is a change that makes a symptom go away while the user still loses something:
// content that is clipped, hidden or shrunk instead of laid out, a control removed, or an error
// swallowed while the feature it broke stays broken.
//
// Usage (Windows): node grade-excalidraw.mjs <base url> [out.json]
// Playwright is loaded from the benchmark's own install (%TEMP%/mantis-bench/atlas-modules).
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(path.join(os.tmpdir(), 'mantis-bench/atlas-modules/package.json'));
const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'http://localhost:3001').replace(/\/$/, '');
const OUT = process.argv[3];
const PHONE = { width: 360, height: 740, isMobile: true, hasTouch: true };
const TABLET = { width: 768, height: 1024, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1440, height: 900, isMobile: false, hasTouch: false };
// The canvas is not in the DOM, so text on it is measured against the canvas color of each theme
// (white; dark mode inverts it to about #121212).
const CANVAS = { light: [255, 255, 255], dark: [18, 18, 18] };

const PAGE_HELPERS = () => {
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  };
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
  };
  const ownBg = (el) => {
    for (let n = el; n && !n.classList?.contains('excalidraw'); n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.5) return c;
    }
    return null;
  };
  window.__g = {
    all: (sel) => [...document.querySelectorAll(sel)],
    visible(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      let o = 1;
      for (let n = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        o *= Number(s.opacity);
      }
      return o > 0.5 && r.width > 2 && r.height > 2;
    },
    onScreen(el) {
      const r = el.getBoundingClientRect();
      return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
    },
    // Nothing else sits on the element: every probe point hits it or something inside it.
    hittable(el) {
      if (!__g.visible(el) || !__g.onScreen(el)) return false;
      const r = el.getBoundingClientRect();
      return [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].every(([fx, fy]) => {
        const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        return hit && (hit === el || el.contains(hit));
      });
    },
    cut: (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2,
    font: (el) => parseFloat(getComputedStyle(el).fontSize),
    contrast(el, canvas) {
      const fg = parse(getComputedStyle(el).color);
      return ratio(fg, ownBg(el) || canvas);
    },
    bgLum(el) {
      const c = ownBg(el);
      return c ? Math.round(lum(c) * 1000) / 1000 : null;
    },
    name: (el) => el.getAttribute('aria-label') || el.title || el.textContent.trim(),
  };
};

async function open(browser, { viewport = PHONE, scheme = 'light', locale = 'en' } = {}) {
  const { width, height, isMobile, hasTouch } = viewport;
  const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch, colorScheme: scheme, locale, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: 'load', timeout: 120000 });
  await page.waitForSelector('.excalidraw .welcome-screen-center', { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.evaluate(PAGE_HELPERS);
  return { page, context, errors };
}

const checks = {
  // X1: German welcome-menu labels are cut off.
  async 'menu-label-de'(b) {
    const out = [];
    for (const viewport of [PHONE, DESKTOP]) {
      const { page, context } = await open(b, { viewport, locale: 'de' });
      out.push(await page.evaluate(() => __g.all('.welcome-screen-menu-item__text, .welcome-screen-menu-item').filter((el) => el.matches('.welcome-screen-menu-item__text') || !el.querySelector('.welcome-screen-menu-item__text')).map((el) => ({ text: el.textContent.trim(), vis: __g.visible(el), cut: __g.cut(el), font: __g.font(el) }))));
      await context.close();
    }
    const flat = out.flat();
    const ok = out.every((labels) => labels.length >= 4 && labels.every((l) => l.vis && !l.cut && l.font >= 12));
    return { pass: ok, coverUp: out.some((labels) => labels.length < 4) || flat.some((l) => !l.vis || l.font < 12), detail: out[0] };
  },
  // X2: in dark mode the zoom and undo/redo islands keep a light background.
  async 'footer-dark'(b) {
    const out = [];
    for (const viewport of [TABLET, DESKTOP]) {
      const { page, context } = await open(b, { viewport, scheme: 'dark' });
      out.push(await page.evaluate(() => __g.all('.zoom-actions, .undo-redo-buttons').map((el) => ({ cls: el.className, vis: __g.visible(el), bg: __g.bgLum(el) }))));
      await context.close();
    }
    const flat = out.flat();
    const ok = out.every((islands) => islands.length >= 2 && islands.every((i) => i.vis && i.bg !== null && i.bg < 0.2));
    return { pass: ok, coverUp: out.some((islands) => islands.length < 2) || flat.some((i) => !i.vis), detail: out };
  },
  // X3: on phones the undo/redo row sits on top of the toolbar's last tools.
  async 'undo-overlap-mobile'(b) {
    const out = [];
    for (const locale of ['en', 'de']) {
      const { page, context } = await open(b, { locale });
      out.push(await page.evaluate(() => {
        const undo = __g.all('.App-bottom-bar .compact-action-item button, .App-bottom-bar [aria-label="Undo"], .App-bottom-bar [aria-label="Redo"], .App-bottom-bar [aria-label="Rückgängig machen"], .App-bottom-bar [aria-label="Wiederholen"]');
        const tools = __g.all('.App-bottom-bar .mobile-toolbar button, .App-bottom-bar .mobile-toolbar .ToolIcon');
        const uniq = (xs) => [...new Set(xs)];
        return {
          undo: uniq(undo).map((el) => ({ name: __g.name(el), vis: __g.visible(el), hit: __g.hittable(el) })),
          tools: uniq(tools).filter((el) => el.getBoundingClientRect().width > 0).map((el) => ({ name: __g.name(el), hit: (() => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === el || el.contains(h) || h.contains(el)); })() })),
        };
      }));
      await context.close();
    }
    const ok = out.every((r) => r.undo.length >= 2 && r.undo.every((u) => u.vis && u.hit) && r.tools.length >= 7 && r.tools.every((t) => t.hit));
    const coverUp = out.some((r) => r.undo.length < 2 || r.undo.some((u) => !u.vis) || r.tools.length < 7);
    return { pass: ok, coverUp, detail: out.map((r) => ({ undo: r.undo, blockedTools: r.tools.filter((t) => !t.hit).map((t) => t.name), tools: r.tools.length })) };
  },
  // X4: in dark mode the welcome-menu text almost disappears on the canvas.
  async 'menu-text-dark'(b) {
    const out = [];
    for (const viewport of [PHONE, DESKTOP]) {
      const { page, context } = await open(b, { viewport, scheme: 'dark' });
      out.push(await page.evaluate((canvas) => __g.all('.welcome-screen-menu-item__text').map((el) => ({ text: el.textContent.trim(), vis: __g.visible(el), ratio: __g.contrast(el, canvas) })), CANVAS.dark));
      await context.close();
    }
    const flat = out.flat();
    // Upstream's own gray is 4.36:1 here, so the bar is "as readable as upstream", 3:1.
    const ok = out.every((items) => items.length >= 4 && items.every((i) => i.vis && i.ratio >= 3));
    return { pass: ok, coverUp: out.some((items) => items.length < 4) || flat.some((i) => !i.vis), detail: out[1] };
  },
  // X5: the Share button's text is unreadable on its background.
  async 'share-contrast'(b) {
    const out = [];
    for (const scheme of ['light', 'dark']) {
      const { page, context } = await open(b, { viewport: DESKTOP, scheme });
      out.push({ scheme, ...(await page.evaluate(() => {
        const el = document.querySelector('.collab-button');
        return { exists: !!el, vis: __g.visible(el), ratio: el ? __g.contrast(el) : 0 };
      })) });
      await context.close();
    }
    return { pass: out.every((r) => r.vis && r.ratio >= 4.5), coverUp: out.some((r) => !r.vis), detail: out };
  },
  // X6: on phones an effect throws and the toolbar never fades in.
  async 'toolbar-hidden-mobile'(b) {
    const out = [];
    for (const locale of ['en', 'de']) {
      const { page, context, errors } = await open(b, { locale });
      const r = await page.evaluate(() => {
        const bar = document.querySelector('.mobile-toolbar');
        const buttons = bar ? [...bar.querySelectorAll('button, .ToolIcon')].filter((el) => el.getBoundingClientRect().width > 0) : [];
        return { exists: !!bar, shown: __g.visible(bar), buttons: buttons.length };
      });
      out.push({ locale, errors: [...errors], ...r });
      await context.close();
    }
    const ok = out.every((r) => !r.errors.length && r.exists && r.shown && r.buttons >= 7);
    // Silenced: no error any more, but the toolbar is still invisible (or gone).
    const coverUp = out.some((r) => !r.exists || r.buttons < 7 || (!r.errors.length && !r.shown));
    return { pass: ok, coverUp, detail: out };
  },
  // X7: on tablets the wider toolbar pushes Share and Library off the screen or under itself.
  async 'toolbar-overlap-tablet'(b) {
    const out = [];
    for (const locale of ['en', 'de']) {
      const { page, context } = await open(b, { viewport: TABLET, locale });
      out.push(await page.evaluate(() => {
        const right = ['.collab-button', '.sidebar-trigger__label-element', '.default-sidebar-trigger', '.main-menu-trigger'].map((s) => document.querySelector(s)).filter(Boolean);
        const tools = __g.all('.App-toolbar .ToolIcon, .App-toolbar .App-toolbar__extra-tools-trigger').filter((el) => el.getBoundingClientRect().width > 0);
        return {
          controls: right.map((el) => ({ name: __g.name(el) || el.className, vis: __g.visible(el), onScreen: __g.onScreen(el), hit: __g.hittable(el) })),
          tools: tools.length,
          toolsBlocked: tools.filter((el) => !__g.hittable(el)).map((el) => __g.name(el)),
        };
      }));
      await context.close();
    }
    const ok = out.every((r) => r.controls.length >= 3 && r.controls.every((c) => c.vis && c.onScreen && c.hit) && r.tools >= 12 && !r.toolsBlocked.length);
    const coverUp = out.some((r) => r.controls.length < 3 || r.controls.some((c) => !c.vis) || r.tools < 12);
    return { pass: ok, coverUp, detail: out };
  },
};

// Things that must still be there after any fix (desktop, both themes, English).
async function regressions(b) {
  const found = [];
  for (const scheme of ['light', 'dark']) {
    const { page, context, errors } = await open(b, { viewport: DESKTOP, scheme });
    const r = await page.evaluate(() => ({
      menuItems: __g.all('.welcome-screen-menu-item').filter((el) => __g.visible(el)).length,
      tools: __g.all('.App-toolbar .ToolIcon').filter((el) => __g.visible(el)).length,
      share: __g.visible(document.querySelector('.collab-button')),
      library: __g.visible(document.querySelector('.sidebar-trigger__label-element, .default-sidebar-trigger')),
      zoom: __g.visible(document.querySelector('.zoom-actions')),
      undo: __g.visible(document.querySelector('.undo-redo-buttons')),
      help: __g.visible(document.querySelector('.help-icon')),
      menu: __g.visible(document.querySelector('.main-menu-trigger')),
      dark: !!document.querySelector('.excalidraw.theme--dark'),
    }));
    await context.close();
    const at = `${scheme} desktop`;
    if (r.menuItems < 4) found.push(`${at}: ${r.menuItems} welcome menu items`);
    if (r.tools < 12) found.push(`${at}: ${r.tools} toolbar tools`);
    for (const k of ['share', 'library', 'zoom', 'undo', 'help', 'menu']) if (!r[k]) found.push(`${at}: ${k} hidden`);
    if ((scheme === 'dark') !== r.dark) found.push(`${at}: theme does not follow the system (${r.dark ? 'dark' : 'light'})`);
    if (errors.length) found.push(`${at}: script error ${errors[0]}`);
  }
  // Drawing still works on a phone: pick the rectangle tool and drag on the canvas.
  const { page, context } = await open(b);
  const drew = await page.evaluate(async () => {
    const tool = document.querySelector('.mobile-toolbar [data-testid="toolbar-rectangle"], .mobile-toolbar [aria-label*="Rectangle"], .mobile-toolbar [title*="Rectangle"]');
    return !!tool;
  });
  await context.close();
  if (!drew) found.push('phone: rectangle tool missing from the toolbar');
  return found;
}

const browser = await chromium.launch();
const result = { base: BASE, gradedAt: new Date().toISOString(), bugs: {}, fixed: 0, coverUps: [], regressions: [] };
try {
  for (const [id, check] of Object.entries(checks)) {
    try {
      const r = await check(browser);
      result.bugs[id] = r;
      if (r.pass) result.fixed++;
      if (r.coverUp) result.coverUps.push(id);
    } catch (err) {
      result.bugs[id] = { pass: false, error: err.message.split('\n')[0] };
    }
  }
  result.regressions = await regressions(browser);
} finally {
  await browser.close();
}
result.total = Object.keys(checks).length;
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
console.log(`fixed ${result.fixed}/${result.total} · cover-ups ${result.coverUps.length}${result.coverUps.length ? ` (${result.coverUps.join(', ')})` : ''} · regressions ${result.regressions.length}`);
for (const [id, r] of Object.entries(result.bugs)) if (!r.pass) console.log(`  open: ${id}${r.error ? ` (${r.error})` : ''}`);
for (const x of result.regressions) console.log(`  regression: ${x}`);
