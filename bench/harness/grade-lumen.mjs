// Hidden grader for the Lumen benchmark (Mantis's buggy-app fixture). It checks each of the 13
// planted bugs with its own Playwright assertions, never Mantis's detectors, plus cover-up and
// regression checks. The agent never sees this file.
//
// Usage (WSL): node grade-lumen.mjs <base url> [out.json]
//   e.g. node grade-lumen.mjs http://127.0.0.1:4361 result.json
// Needs Playwright: it is loaded from ~/projects/mantis/node_modules.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'http://127.0.0.1:4361').replace(/\/$/, '');
const OUT = process.argv[3];
const MOBILE = { width: 360, height: 740, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1440, height: 900, isMobile: false, hasTouch: false };
const VI_NEWSLETTER = 'Đăng ký nhận bản tin';
const VI_SAVE = 'Lưu tất cả thay đổi';

// Runs in the page: helpers shared by the checks.
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
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0.5) return c;
    }
    return parse(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255, 1];
  };
  window.__g = {
    visible(sel) {
      const el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (!el) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      let o = 1;
      for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return s.display !== 'none' && s.visibility !== 'hidden' && o > 0.1 && r.width > 2 && r.height > 2;
    },
    rect(sel) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      return r ? { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height } : null;
    },
    contrast(sel) {
      const el = document.querySelector(sel);
      if (!el) return 0;
      const fg = parse(getComputedStyle(el).color);
      const bg = bgOf(el);
      const a = lum(fg);
      const b = lum(bg);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    },
    bgLum(sel) {
      const el = document.querySelector(sel);
      return el ? lum(bgOf(el)) : null;
    },
    fontPx(sel) {
      const el = document.querySelector(sel);
      return el ? parseFloat(getComputedStyle(el).fontSize) : 0;
    },
    clipped(sel) {
      const el = document.querySelector(sel);
      return el ? el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2 : true;
    },
    pageScrollsX: () => document.documentElement.scrollWidth > innerWidth + 1,
    rootHidesX: () => [document.documentElement, document.body].some((n) => /hidden|clip/.test(getComputedStyle(n).overflowX)),
    text: (sel) => (document.querySelector(sel)?.innerText || '').replace(/\s+/g, ' ').trim(),
  };
};

const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function open(browser, route, { viewport = MOBILE, scheme = 'light', locale = 'en' } = {}) {
  const { width, height, isMobile, hasTouch } = viewport;
  const context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch, colorScheme: scheme, locale, extraHTTPHeaders: { 'Accept-Language': locale }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await page.evaluate(PAGE_HELPERS);
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
    scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
  await page.evaluate(PAGE_HELPERS);
  return { page, context, errors };
}

const checks = {
  async 'promo-overflow'(b) {
    const { page, context } = await open(b, '/');
    const r = await page.evaluate(() => ({ scrolls: __g.pageScrollsX(), hides: __g.rootHidesX(), vis: __g.visible('#promo-banner'), cut: __g.clipped('#promo-banner p') , right: __g.rect('#promo-banner')?.w }));
    await context.close();
    return { pass: !r.scrolls && !r.hides && r.vis && r.right <= 361, coverUp: r.hides || !r.vis, detail: r };
  },
  async 'nav-clip-vi'(b) {
    const { page, context } = await open(b, '/', { viewport: DESKTOP, locale: 'vi' });
    const r = await page.evaluate(() => {
      const nav = document.querySelector('#nav-links');
      const nr = nav.getBoundingClientRect();
      const links = [...nav.querySelectorAll('a')];
      const cut = links.filter((a) => { const r = a.getBoundingClientRect(); return !__g.visible(a) || r.right > nr.right + 1 || r.bottom > nr.bottom + 1 || a.scrollWidth > a.clientWidth + 1; }).map((a) => a.innerText);
      return { links: links.length, cut, navClips: nav.scrollWidth > nav.clientWidth + 1, minFont: Math.min(...links.map((a) => parseFloat(getComputedStyle(a).fontSize))) };
    });
    await context.close();
    return { pass: r.links >= 5 && !r.cut.length && !r.navClips && r.minFont >= 12, coverUp: r.links < 5 || r.minFont < 12, detail: r };
  },
  async 'header-overlap'(b) {
    const { page, context } = await open(b, '/');
    const r = await page.evaluate(() => ({ toggle: __g.visible('#menu-toggle'), cta: __g.visible('#header-cta'), a: __g.rect('#menu-toggle'), b: __g.rect('#header-cta') }));
    await context.close();
    return { pass: r.toggle && r.cta && !overlap(r.a, r.b), coverUp: !r.toggle || !r.cta, detail: { toggle: r.toggle, cta: r.cta, overlap: overlap(r.a, r.b) } };
  },
  async 'late-hero-shift'(b) {
    const { page, context } = await open(b, '/');
    const r = await page.evaluate(() => {
      const img = document.querySelector('#hero-art');
      const s = img && getComputedStyle(img);
      return { exists: !!img, loaded: !!img && img.complete && img.naturalWidth > 0, reserved: !!img && ((img.hasAttribute('width') && img.hasAttribute('height')) || (s.aspectRatio && s.aspectRatio !== 'auto')), vis: __g.visible('#hero-art') };
    });
    // CLS on a fresh load, before any scrolling.
    const ctx2 = await b.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, reducedMotion: 'reduce' });
    const p2 = await ctx2.newPage();
    await p2.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
    await p2.goto(BASE + '/', { waitUntil: 'networkidle' });
    await p2.waitForTimeout(1500);
    const cls = await p2.evaluate(() => window.__cls);
    await ctx2.close();
    await context.close();
    return { pass: r.exists && r.loaded && r.reserved && r.vis && cls < 0.05, coverUp: !r.exists || !r.vis, detail: { ...r, cls: Math.round(cls * 1000) / 1000 } };
  },
  async 'hero-note-contrast'(b) {
    const { page, context } = await open(b, '/');
    const r = await page.evaluate(() => ({ vis: __g.visible('#hero-note'), ratio: __g.contrast('#hero-note'), font: __g.fontPx('#hero-note'), text: __g.text('#hero-note').length }));
    await context.close();
    return { pass: r.vis && r.ratio >= 4.5 && r.font >= 12 && r.text > 10, coverUp: !r.vis || r.text <= 10, detail: r };
  },
  async 'card-theme-leak'(b) {
    const { page, context } = await open(b, '/', { scheme: 'dark' });
    const r = await page.evaluate(() => ({ vis: __g.visible('#plan-business'), bg: __g.bgLum('#plan-business'), name: __g.contrast('#plan-business .plan-name'), amount: __g.contrast('#plan-business .amount') }));
    await context.close();
    return { pass: r.vis && r.bg < 0.2 && r.name >= 4.5 && r.amount >= 4.5, coverUp: !r.vis, detail: r };
  },
  async 'badge-covers-cta'(b) {
    const { page, context } = await open(b, '/');
    const r = await page.evaluate(() => ({ badge: __g.visible('#popular-badge'), cta: __g.visible('#plan-pro-cta'), a: __g.rect('#popular-badge'), b: __g.rect('#plan-pro-cta') }));
    await context.close();
    return { pass: r.badge && r.cta && !overlap(r.a, r.b), coverUp: !r.badge || !r.cta, detail: { badge: r.badge, cta: r.cta, overlap: overlap(r.a, r.b) } };
  },
  async 'missing-image'(b) {
    const { page, context } = await open(b, '/');
    const r = await page.evaluate(() => { const i = document.querySelector('#team-photo'); return { exists: !!i, loaded: !!i && i.complete && i.naturalWidth > 0, vis: __g.visible('#team-photo') }; });
    await context.close();
    return { pass: r.exists && r.loaded && r.vis, coverUp: !r.exists || !r.vis, detail: r };
  },
  async 'newsletter-btn-clip'(b) {
    const out = [];
    for (const viewport of [MOBILE, DESKTOP]) {
      const { page, context } = await open(b, '/', { viewport, locale: 'vi' });
      out.push(await page.evaluate(() => ({ vis: __g.visible('#newsletter-submit'), cut: __g.clipped('#newsletter-submit'), font: __g.fontPx('#newsletter-submit'), text: __g.text('#newsletter-submit') })));
      await context.close();
    }
    const ok = out.every((r) => r.vis && !r.cut && r.font >= 12 && r.text === VI_NEWSLETTER);
    return { pass: ok, coverUp: out.some((r) => !r.vis || r.font < 12 || r.text !== VI_NEWSLETTER), detail: out };
  },
  async 'social-tap-targets'(b) {
    const { page, context } = await open(b, '/');
    const r = await page.evaluate(() => [...document.querySelectorAll('#social-links a')].map((a) => { const x = a.getBoundingClientRect(); return { w: Math.round(x.width), h: Math.round(x.height), vis: __g.visible(a) }; }));
    await context.close();
    return { pass: r.length >= 3 && r.every((a) => a.vis && a.w >= 24 && a.h >= 24), coverUp: r.length < 3 || r.some((a) => !a.vis), detail: r };
  },
  async 'settings-js-error'(b) {
    const { page, context, errors } = await open(b, '/settings.html');
    const r = await page.evaluate(() => ({ save: __g.visible('#save-settings') }));
    await context.close();
    return { pass: errors.length === 0 && r.save, coverUp: !r.save, detail: { errors, ...r } };
  },
  async 'save-button-wrap'(b) {
    const out = [];
    for (const viewport of [MOBILE, DESKTOP]) {
      const { page, context } = await open(b, '/settings.html', { viewport, locale: 'vi' });
      out.push(await page.evaluate(() => {
        const el = document.querySelector('#save-settings');
        const s = getComputedStyle(el);
        const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.2;
        const inner = el.getBoundingClientRect().height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth);
        return { vis: __g.visible(el), lines: Math.round(inner / lh), cut: __g.clipped('#save-settings'), font: parseFloat(s.fontSize), text: __g.text('#save-settings') };
      }));
      await context.close();
    }
    const ok = out.every((r) => r.vis && r.lines <= 2 && !r.cut && r.font >= 12 && r.text === VI_SAVE);
    return { pass: ok, coverUp: out.some((r) => !r.vis || r.font < 12 || r.text !== VI_SAVE), detail: out };
  },
  async 'danger-title-leak'(b) {
    const { page, context } = await open(b, '/settings.html', { scheme: 'dark' });
    const r = await page.evaluate(() => ({ vis: __g.visible('#danger-title'), ratio: __g.contrast('#danger-title'), text: __g.text('#danger-title') }));
    await context.close();
    return { pass: r.vis && r.ratio >= 4.5 && r.text.length > 3, coverUp: !r.vis || r.text.length <= 3, detail: r };
  },
};

// Things that must still be there after any fix (regressions).
async function regressions(b) {
  const found = [];
  for (const scheme of ['light', 'dark']) {
    const { page, context } = await open(b, '/', { scheme });
    const r = await page.evaluate(() => ({
      nav: document.querySelectorAll('#nav-links a').length,
      cta: __g.visible('#header-cta'),
      plans: document.querySelectorAll('.plan').length,
      email: !!document.querySelector('input[type=email]'),
      h1: __g.visible('h1'),
      rootHides: __g.rootHidesX(),
    }));
    await context.close();
    if (r.nav < 5) found.push(`${scheme}: nav has ${r.nav} links`);
    if (!r.cta) found.push(`${scheme}: header CTA hidden`);
    if (r.plans < 3) found.push(`${scheme}: ${r.plans} pricing plans`);
    if (!r.email) found.push(`${scheme}: newsletter email field missing`);
    if (!r.h1) found.push(`${scheme}: h1 hidden`);
    if (r.rootHides) found.push(`${scheme}: overflow-x hidden/clip on html or body`);
  }
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
