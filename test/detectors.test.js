/**
 * Focused detector tests on tiny in-memory pages: each detector must flag the real problem and
 * stay quiet on the look-alike patterns it is documented to ignore.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import brokenImage from '../src/detectors/broken-image.js';
import clippedText from '../src/detectors/clipped-text.js';
import consoleErrors from '../src/detectors/console.js';
import contrast from '../src/detectors/contrast.js';
import layoutShift from '../src/detectors/layout-shift.js';
import overlap from '../src/detectors/overlap.js';
import pageOverflow from '../src/detectors/page-overflow.js';
import requestFailed from '../src/detectors/request-failed.js';
import tapTarget from '../src/detectors/tap-target.js';
import themeLeak from '../src/detectors/theme-leak.js';
import { installMantisLib } from '../src/inpage/lib.js';
import { VIEWPORT_PRESETS } from '../src/options.js';
import { applyDarkStrategy, contextOptions, nextFrames, settle, trackConsole, trackNetwork } from '../src/page.js';

const ORIGIN = 'http://mantis.test';
let browser;

before(async () => {
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
});

const BASE_CSS = 'body{margin:0;font:16px/1.5 Arial,"Liberation Sans",Helvetica,sans-serif;color:#111;background:#fff}';
const SVG_NO_SIZE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>';
const SVG_400 = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#4f46e5"/></svg>';

function htmlDoc(body, css = '', head = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${BASE_CSS}${css}</style>${head}</head><body>${body}</body></html>`;
}

/** Open an in-memory page in a context configured like a Mantis cell. */
async function open(html, { viewport = 'desktop', scheme = 'light', assets = {}, setup = [], lib = {} } = {}) {
  const v = VIEWPORT_PRESETS[viewport];
  const context = await browser.newContext(contextOptions({ viewport: v, scheme, locale: 'en' }));
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin === ORIGIN && u.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    const a = u.origin === ORIGIN ? assets[u.pathname] : null;
    if (a) return route.fulfill(a);
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });
  const page = await context.newPage();
  const ctx = {
    url: `${ORIGIN}/`,
    cell: { viewport: v, scheme, locale: 'en' },
    cellInfo: {},
    network: trackNetwork(page),
    console: trackConsole(page),
  };
  for (const d of setup) await d.setup(page, ctx);
  await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
  await settle(page, { idleTimeout: 3000 });
  await page.evaluate(installMantisLib, lib);
  return { context, page, ctx };
}

async function detect(detector, body, { css = '', head = '', ...opts } = {}) {
  const { context, page, ctx } = await open(htmlDoc(body, css, head), { ...opts, setup: detector.setup ? [detector] : [] });
  try {
    if (detector.applies && !detector.applies(ctx)) return [];
    return await detector.run(page, ctx);
  } finally {
    await context.close();
  }
}

const sels = (issues) => issues.map((i) => i.selector).sort();

describe('page-overflow', () => {
  test('reports the outermost wide element on mobile', async () => {
    const issues = await detect(pageOverflow, '<main><div id="wide" style="width:600px;height:40px"><span>inside</span></div></main>', { viewport: 'mobile' });
    assert.deepEqual(sels(issues), ['#wide']);
    assert.equal(issues[0].severity, 'error');
    assert.equal(issues[0].evidence.overflowBy, 240);
  });

  test('a nowrap row overflowing with several children is reported once, on the row', async () => {
    const items = Array.from({ length: 6 }, (_, i) => `<a href="#" style="flex:0 0 100px">Item ${i}</a>`).join('');
    const issues = await detect(pageOverflow, `<nav id="row" style="display:flex">${items}</nav>`, { viewport: 'mobile' });
    assert.deepEqual(sels(issues), ['#row']);
  });

  test('quiet when overflow is clipped by a component, scrollable or fixed', async () => {
    assert.deepEqual(await detect(pageOverflow, '<div style="overflow-x:auto"><div style="width:900px">scroller</div></div>', { viewport: 'mobile' }), []);
    assert.deepEqual(await detect(pageOverflow, '<div style="overflow:hidden"><div style="width:900px">clipped</div></div><p style="height:900px">rest of the page</p>', { viewport: 'mobile' }), []);
    assert.deepEqual(await detect(pageOverflow, '<div style="position:fixed;left:0;top:0;width:900px">fixed</div>', { viewport: 'mobile' }), []);
  });

  test('overflow hidden on html, body or the app root does not hide the culprit', async () => {
    const onBody = await detect(pageOverflow, '<div id="wide" style="width:600px">Spring sale banner</div>', { viewport: 'mobile', css: 'body{overflow-x:hidden}' });
    assert.deepEqual(onBody.map((i) => [i.selector, i.severity, i.evidence.maskedBy, i.evidence.maskValue]), [['#wide', 'error', 'body', 'hidden']]);
    assert.match(onBody[0].message, /`body \{ overflow-x: hidden \}` only hides the part that is cut off/);
    const onRoot = await detect(pageOverflow, '<div id="root" style="overflow-x:clip"><main><div id="wide" style="width:600px">Spring sale banner</div><p style="height:900px">rest of the app</p></main></div>', { viewport: 'mobile' });
    assert.deepEqual(onRoot.map((i) => [i.selector, i.evidence.maskedBy]), [['#wide', '#root']]);
  });

  test('a mask stays quiet on decoration, off-canvas panels, carousels and empty boxes', async () => {
    const body = `
      <div aria-hidden="true" style="width:700px;height:40px">decorative backdrop text</div>
      <nav style="position:absolute;top:0;left:100%;width:280px">Off-canvas menu <a href="#">Home</a></nav>
      <div style="display:flex;transform:translateX(-100px)"><div style="flex:0 0 300px">Slide one</div><div style="flex:0 0 300px">Slide two</div></div>
      <div style="width:600px;height:80px;background:linear-gradient(90deg,#fde68a,#fca5a5)"></div>`;
    assert.deepEqual(await detect(pageOverflow, body, { viewport: 'mobile', css: 'html{overflow-x:hidden}' }), []);
  });
});

describe('clipped-text', () => {
  test('error when overflow:hidden cuts a label', async () => {
    const issues = await detect(clippedText, '<button id="b" style="width:80px;white-space:nowrap;overflow:hidden;padding:0 8px">Subscribe to the newsletter</button>');
    assert.deepEqual(issues.map((i) => [i.selector, i.severity, i.evidence.axes[0]]), [['#b', 'error', 'x']]);
  });

  test('error when a fixed height cuts lines', async () => {
    const text = 'This description is long enough to need several lines in a narrow box. '.repeat(3);
    const issues = await detect(clippedText, `<p id="p" style="width:180px;height:48px;overflow:hidden;margin:0">${text}</p>`);
    assert.deepEqual(issues.map((i) => [i.selector, i.severity, i.evidence.axes[0]]), [['#p', 'error', 'y']]);
  });

  test('ellipsis or line-clamp without the full text is a warning; with a title it is fine', async () => {
    const long = 'A very long product name that does not fit';
    const ell = 'width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    const clamp = 'width:160px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden';
    const warn = await detect(clippedText, `<p id="e" style="${ell}">${long}</p><p id="c" style="${clamp}">${long}. ${long}. ${long}.</p>`);
    assert.deepEqual(warn.map((i) => [i.selector, i.severity, i.key]).sort(), [['#c', 'warn', 'truncated'], ['#e', 'warn', 'truncated']]);
    const ok = await detect(clippedText, `<p style="${ell}" title="${long}">${long}</p><p style="${clamp}" aria-label="x">${long}. ${long}. ${long}.</p>`);
    assert.deepEqual(ok, []);
  });

  test('quiet on visually-hidden text, scroll containers, collapsed panels and carousels', async () => {
    const body = `
      <label style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">Email address for the newsletter</label>
      <div style="width:120px;overflow-x:auto;white-space:nowrap">A scrollable row of long text that the user can scroll</div>
      <div style="max-height:0;overflow:hidden">Collapsed accordion content that is hidden on purpose</div>
      <div style="width:300px;overflow:hidden"><div style="display:flex;transform:translateX(-120px)">
        <div style="flex:0 0 200px">Slide one with some text</div><div style="flex:0 0 200px">Slide two with some text</div></div></div>`;
    assert.deepEqual(await detect(clippedText, body), []);
  });

  test('warns when a short button label wraps onto 3+ lines', async () => {
    const issues = await detect(clippedText, '<button id="w" style="width:70px;font-size:15px">Save all your changes</button><button style="width:200px">Save all your changes</button>');
    assert.deepEqual(issues.map((i) => [i.selector, i.severity, i.key]), [['#w', 'warn', 'wrap']]);
    assert.ok(issues[0].evidence.lines >= 3);
  });
});

describe('overlap', () => {
  test('interactive elements on top of each other', async () => {
    const issues = await detect(overlap, `
      <button id="a" style="position:absolute;left:20px;top:20px;width:120px;height:40px">First</button>
      <button id="b" style="position:absolute;left:80px;top:20px;width:120px;height:40px">Second</button>`);
    assert.deepEqual(issues.map((i) => [i.selector, i.evidence.with]), [['#b', '#a']]);
  });

  test('text covered by an opaque positioned element', async () => {
    const issues = await detect(overlap, `
      <div style="position:relative;width:400px;padding:20px">
        <p id="t" style="margin:0;font-size:18px">Important text that should stay readable</p>
        <span id="badge" style="position:absolute;left:40px;top:18px;width:160px;padding:4px 0;text-align:center;background:#4f46e5;color:#fff">Sale</span>
      </div>`);
    assert.deepEqual(issues.map((i) => [i.selector, i.evidence.with]), [['#badge', '#t']]);
  });

  test('quiet on stretched links, field adornments, transparent overlays and bottom fixed bars', async () => {
    const body = `
      <article style="position:relative;width:320px;padding:16px;border:1px solid #ccc">
        <h3>Card title</h3><p>Card body text that sits under the stretched link.</p>
        <a href="#" class="stretched">Read more</a>
      </article>
      <div style="position:relative;width:240px;margin:20px">
        <input style="width:240px;height:40px;box-sizing:border-box;padding-right:36px" value="search">
        <button aria-label="Clear" style="position:absolute;right:8px;top:10px;width:20px;height:20px;padding:0">x</button>
      </div>
      <div style="position:relative"><p>Text under a transparent click layer</p><a href="#" style="position:absolute;inset:0" aria-label="open"></a></div>
      <p style="position:absolute;left:20px;top:850px;margin:0">Paragraph that the cookie bar floats over</p>
      <div style="position:fixed;left:0;right:0;bottom:0;height:80px;background:#111;color:#fff">We use cookies <button>OK</button></div>`;
    const css = '.stretched::after{content:"";position:absolute;inset:0}';
    assert.deepEqual(await detect(overlap, body, { css }), []);
  });

  test('a fixed header hiding content at the top is reported', async () => {
    const issues = await detect(overlap, `
      <header id="bar" style="position:fixed;top:0;left:0;right:0;height:64px;background:#fff;border-bottom:1px solid #ddd">Logo</header>
      <h1 id="title" style="margin:20px 0 0;font-size:32px">Hero title hidden under the header</h1>`);
    assert.deepEqual(issues.map((i) => [i.selector, i.evidence.with]), [['#bar', '#title']]);
  });
});

describe('contrast', () => {
  test('axe color-contrast violations become issues with ratios', async () => {
    const issues = await detect(contrast, '<p id="low" style="color:#aaa">Light grey text on white</p><p style="color:#333">Readable text</p>');
    assert.deepEqual(sels(issues), ['#low']);
    assert.equal(issues[0].evidence.contrastRatio, 2.32);
    assert.match(issues[0].message, /2\.32:1 \(needs 4\.5:1\)/);
  });
});

describe('tap-target', () => {
  test('small targets packed together on mobile, with the WCAG exceptions honoured', async () => {
    const icons = ['a', 'b', 'c'].map((x) => `<a id="i${x}" href="#" style="display:inline-block;width:16px;height:16px;background:#ccc"></a>`).join('');
    const body = `
      <div style="display:flex;gap:4px;margin:20px">${icons}</div>
      <p style="width:300px">Read our <a href="#">terms</a> and the <a href="#">privacy policy</a> before signing up.</p>
      <div style="margin:80px 20px"><button id="lonely" style="width:16px;height:16px;padding:0"></button></div>
      <label style="margin:20px;display:block"><input type="checkbox"> Remember me</label>`;
    const issues = await detect(tapTarget, body, { viewport: 'mobile' });
    assert.equal(issues.length, 1, 'three targets of the same kind are grouped');
    assert.equal(issues[0].selector, '#ia');
    assert.equal(issues[0].severity, 'warn');
    assert.equal(issues[0].evidence.count, 3);
    assert.equal(issues[0].extraRects.length, 2, 'every target is outlined');
    assert.deepEqual(await detect(tapTarget, body, { viewport: 'desktop' }), [], 'only runs on phone-sized viewports');
  });

  test('off-screen skip links are not targets', async () => {
    const body = `
      <div style="position:absolute;left:-9999px;top:0;display:flex;gap:2px"><a href="#a" style="display:block;width:10px;height:10px">A</a><a href="#b" style="display:block;width:10px;height:10px">B</a></div>
      <div style="position:fixed;left:100%;top:10px;display:flex;gap:2px"><a href="#c" style="display:block;width:10px;height:10px">C</a><a href="#d" style="display:block;width:10px;height:10px">D</a></div>`;
    assert.deepEqual(await detect(tapTarget, body, { viewport: 'mobile' }), []);
  });
});

describe('precision guards', () => {
  test('overlap: a fanned deck of identical cards and a pointer-events:none hint are fine', async () => {
    const cards = [0, 1, 2].map((i) => `<a href="#c${i}" class="shot" style="position:absolute;left:${40 + i * 60}px;top:40px;width:220px;height:140px;background:#ddd;transform:rotate(${(i - 1) * 6}deg)">Shot ${i}</a>`).join('');
    const hint = `<form style="position:relative;width:260px;margin:20px"><input style="width:260px;height:36px;box-sizing:border-box;background:#f2f2f2;border:0" placeholder="Search">
      <div style="position:absolute;right:8px;top:8px;pointer-events:none"><kbd>Ctrl</kbd> <kbd>K</kbd></div></form>`;
    assert.deepEqual(await detect(overlap, `<div style="position:relative;height:240px">${cards}</div>${hint}`), []);
  });

  test('overlap: transparent hit-area padding, layered duplicate text and stacked mock cards are fine', async () => {
    const icons = `<div style="display:flex;margin:20px">
      <button aria-label="Menu" style="margin-right:-10px;padding:12px;background:none;border:0"><svg width="20" height="20"><rect width="20" height="20"/></svg></button>
      <button aria-label="Search" style="padding:12px;background:none;border:0"><svg width="20" height="20"><rect width="20" height="20"/></svg></button></div>`;
    const layered = `<h1 style="position:relative;margin:20px;font-size:32px"><span>Grow your revenue</span>
      <span aria-label="x" style="position:absolute;left:0;top:0;color:#4f46e5;background:#fff">Grow your revenue</span></h1>`;
    const stack = `<div style="position:relative;height:220px;margin:20px">${[0, 1, 2].map((i) => `<div class="mock-card" style="position:absolute;left:${i * 30}px;top:${i * 40}px;width:240px;padding:12px;background:#fff;border:1px solid #ccc"><p style="margin:0">Payment ${i} succeeded</p></div>`).join('')}</div>`;
    assert.deepEqual(await detect(overlap, icons + layered + stack), []);
  });

  test('clipped-text: a cropped preview frame is not a cut label; a max-height teaser is a truncation warning', async () => {
    const frame = `<div id="frame" style="width:300px;height:120px;overflow:hidden;border:1px solid #ccc">
      <div><div><div><div><p style="width:600px;margin:0">${'Demo content wider than its frame. '.repeat(6)}</p></div></div></div></div></div>`;
    const teaser = `<p id="teaser" style="width:220px;max-height:48px;overflow:hidden;line-height:24px;margin:20px 0">${'A summary that is longer than two lines of text. '.repeat(3)}</p>`;
    const issues = await detect(clippedText, frame + teaser);
    assert.deepEqual(issues.map((i) => [i.selector, i.severity, i.key]), [['#teaser', 'warn', 'truncated']]);
    assert.match(issues[0].message, /max-height of 48px/);
  });

  test('clipped-text: big display links that wrap are typography, not broken buttons', async () => {
    const issues = await detect(clippedText, '<a href="#" style="display:block;width:180px;padding:8px;background:#eee;font-size:28px">Shrinivass Arunachalam Balasubramanian</a>');
    assert.deepEqual(issues, []);
  });

  test('theme-leak: a readable inverted button is fine, a readable light panel is a warning', async () => {
    const css = ':root{--bg:#fff;--text:#111827} @media (prefers-color-scheme: dark){:root{--bg:#0b1020;--text:#e5e7eb}} body{background:var(--bg);color:var(--text)}';
    const body = `<a href="#" id="inv" style="display:inline-block;margin:20px;padding:10px 16px;background:#fff;color:#111">Get started</a>
      <section id="panel" style="margin:20px;padding:24px;width:320px;background:#f8fafc;color:#1f2937">A note box with hard-coded colors that stays light.</section>`;
    const snaps = {};
    const pages = [];
    for (const scheme of ['light', 'dark']) {
      const o = await open(htmlDoc(body, css), { scheme });
      pages.push(o);
      snaps[scheme] = await themeLeak.collect(o.page);
    }
    const cmp = themeLeak.compare(snaps.light, snaps.dark);
    const issues = await themeLeak.resolve(pages[1].page, cmp.findings);
    for (const o of pages) await o.context.close();
    assert.deepEqual(issues.map((i) => [i.selector, i.severity, i.evidence.kind]), [['#panel', 'warn', 'container']]);
  });

  test('contrast: one issue per failing color pair, listing every element', async () => {
    const issues = await detect(contrast, '<p style="color:#999">One</p><p style="color:#999">Two</p><span style="color:#999">Three</span><p style="color:#222">Fine</p>');
    assert.equal(issues.length, 1);
    assert.equal(issues[0].evidence.count, 3);
    assert.match(issues[0].message, /in 3 elements/);
    assert.equal(issues[0].extraRects.length, 2);
  });

  test('data-mantis-ignore and --ignore selectors silence a subtree', async () => {
    const body = '<div data-mantis-ignore><img src="/missing-a.png" alt="a" width="40" height="40"></div><div class="third-party"><img src="/missing-b.png" alt="b" width="40" height="40"></div><img id="kept" src="/missing-c.png" alt="c" width="40" height="40">';
    const { context, page, ctx } = await open(htmlDoc(body), { lib: { ignore: ['.third-party'] } });
    try {
      assert.deepEqual(sels(await brokenImage.run(page, ctx)), ['#kept']);
    } finally {
      await context.close();
    }
  });
});

describe('broken-image, console and request-failed', () => {
  test('broken images are errors; valid SVGs without intrinsic size are not', async () => {
    const assets = { '/ok.svg': { contentType: 'image/svg+xml', body: SVG_NO_SIZE } };
    const { context, page, ctx } = await open(htmlDoc('<img id="miss" src="/missing.png" alt="Team photo" width="60" height="60"><img src="/ok.svg" alt="" style="width:40px">'), { assets });
    try {
      const issues = await brokenImage.run(page, ctx);
      assert.deepEqual(sels(issues), ['#miss']);
      assert.match(issues[0].message, /\/missing\.png \(HTTP 404\)/);
      const failed = await requestFailed.run(page, ctx);
      assert.deepEqual(failed.map((i) => i.message), ['GET /missing.png returned HTTP 404 (image).']);
      const cons = await consoleErrors.run(page, ctx);
      assert.deepEqual(cons, [], '"Failed to load resource" console noise is not reported twice');
    } finally {
      await context.close();
    }
  });

  test('uncaught errors and console.error are errors; cross-origin failures are ignored', async () => {
    const { context, page, ctx } = await open(htmlDoc(`
      <img src="https://cdn.other.test/x.png" alt="">
      <script>console.error('Widget failed to init'); null.boom;</script>`));
    try {
      const cons = await consoleErrors.run(page, ctx);
      assert.equal(cons.length, 2);
      assert.match(cons.find((i) => i.evidence.kind === 'pageerror').message, /^Uncaught TypeError: Cannot read properties of null/);
      assert.match(cons.find((i) => i.evidence.kind === 'console.error').message, /^console\.error: Widget failed to init/);
      assert.deepEqual(await requestFailed.run(page, ctx), []);
    } finally {
      await context.close();
    }
  });
});

describe('layout-shift', () => {
  test('a late image without dimensions is named as the likely cause', async () => {
    const assets = { '/hero.svg': { contentType: 'image/svg+xml', body: SVG_400 } };
    const body = `
      <img id="hero" alt="" style="display:block;width:800px;height:auto">
      <h1 style="margin:0;font-size:40px">Headline</h1><p>${'Body text. '.repeat(80)}</p>
      <script>addEventListener('load', () => requestAnimationFrame(() => requestAnimationFrame(() =>
        setTimeout(() => { document.getElementById('hero').src = '/hero.svg'; }, 50))));</script>`;
    const { context, page, ctx } = await open(htmlDoc(body), { assets, setup: [layoutShift] });
    try {
      const issues = await layoutShift.run(page, ctx);
      assert.equal(issues.length, 1);
      assert.equal(issues[0].selector, '#hero');
      assert.ok(issues[0].evidence.cls > 0.1);
      assert.equal(issues[0].evidence.likelyCause.missingSize, true);
    } finally {
      await context.close();
    }
  });
});

describe('theme-leak', () => {
  const tokens = ':root{--bg:#fff;--surface:#fff;--text:#111827} body{background:var(--bg);color:var(--text)} .card{background:var(--surface);padding:20px;margin:20px;width:300px}';
  const darkTokens = '{--bg:#0b1020;--surface:#121a2e;--text:#e5e7eb}';
  const mediaCss = `${tokens} @media (prefers-color-scheme: dark){:root${darkTokens}}`;
  const classCss = `${tokens} html.dark${darkTokens}`;
  const body = `
    <div class="card" id="ok">Themed card</div>
    <div class="card" id="leak" style="background:#fff">Card with a hard-coded white background</div>
    <div class="card"><h2 id="title" style="color:#1f2937">Hard-coded heading</h2></div>
    <a href="#" style="display:inline-block;margin:20px;padding:12px 20px;background:#4f46e5;color:#fff">Brand button</a>`;

  async function compare(strategy, css) {
    const snaps = {};
    const pages = {};
    const contexts = [];
    for (const scheme of ['light', 'dark']) {
      const { context, page } = await open(htmlDoc(body, css));
      contexts.push(context);
      if (strategy.kind === 'media') await page.emulateMedia({ colorScheme: scheme });
      await applyDarkStrategy(page, strategy, scheme);
      await nextFrames(page);
      snaps[scheme] = await themeLeak.collect(page);
      pages[scheme] = page;
    }
    const cmp = themeLeak.compare(snaps.light, snaps.dark);
    const issues = await themeLeak.resolve(pages.dark, cmp.findings);
    for (const c of contexts) await c.close();
    return { cmp, issues };
  }

  test('media strategy: hard-coded surfaces and text colors are reported, tokens and brand colors are not', async () => {
    const { cmp, issues } = await compare({ kind: 'media' }, mediaCss);
    assert.equal(cmp.flipped, true);
    assert.deepEqual(issues.map((i) => [i.selector, i.evidence.kind]).sort(), [['#leak', 'container'], ['#title', 'text']]);
  });

  test('a class-based theme does not react to the media strategy, and does to class:dark', async () => {
    const media = await compare({ kind: 'media' }, classCss);
    assert.equal(media.cmp.flipped, false);
    assert.equal(media.cmp.unchanged, true, 'reported as "dark scheme had no effect"');
    assert.deepEqual(media.issues, []);
    const cls = await compare({ kind: 'class', name: 'dark' }, classCss);
    assert.equal(cls.cmp.flipped, true);
    assert.deepEqual(cls.issues.map((i) => i.selector).sort(), ['#leak', '#title']);
  });
});

describe('precision fixes from the OSS scan', () => {
  test('console: service-worker registration errors are not reported (Mantis blocks service workers)', async () => {
    const { context, page, ctx } = await open(htmlDoc(`<p>hi</p><script>
      console.error('registerSW failed', new TypeError("Cannot read properties of undefined (reading 'waiting')"));
      console.error('real failure');
    </script>`));
    ctx.cellInfo = { notes: [] };
    try {
      const issues = await consoleErrors.run(page, ctx);
      assert.equal(issues.length, 1);
      assert.match(issues[0].message, /^console\.error: real failure/);
      assert.match(ctx.cellInfo.notes[0], /1 console error about service workers not reported/);
    } finally {
      await context.close();
    }
  });

  test('overlap: a small pill drawn on a media thumbnail is a deliberate overlay', async () => {
    const issues = await detect(overlap, `
      <div style="position:relative;width:320px;height:180px">
        <a id="thumb" href="#" style="display:block;width:320px;height:180px"><img src="data:image/svg+xml,${encodeURIComponent(SVG_400)}" alt="A photo" style="width:320px;height:180px;display:block"></a>
        <button id="alt" style="position:absolute;left:8px;bottom:8px;height:24px;padding:0 8px">ALT</button>
      </div>
      <div style="position:relative;width:320px;margin-top:20px">
        <a id="label" href="#" style="display:block;padding:12px;background:#eef">Upgrade to Pro</a>
        <button id="badge" style="position:absolute;left:20px;top:8px;height:28px">Popular</button>
      </div>`);
    assert.deepEqual(issues.map((i) => [i.selector, i.evidence.with]), [['#badge', '#label']], 'a button on a text link is still reported');
  });
});

describe('canvas apps: backgrounds read from pixels', () => {
  // A whiteboard-like page: the "page" is a full-screen <canvas>, the UI sits on top with
  // pointer-events:none, and a transparent layer covers everything (axe: "bgOverlap").
  const paint = '<script>const c=document.getElementById("cv");c.width=innerWidth;c.height=innerHeight;const x=c.getContext("2d");x.fillStyle=matchMedia("(prefers-color-scheme: dark)").matches?"#121212":"#ffffff";x.fillRect(0,0,c.width,c.height);</script>';
  const css = 'body{background:transparent} #cv{position:fixed;inset:0;width:100%;height:100%} .ui{position:fixed;inset:0;z-index:1;pointer-events:none;padding:40px} .ui p{font-size:18px;margin:0 0 16px}';
  const ui = (cover) => `
    <canvas id="cv"></canvas>
    <div class="ui">
      <p id="faint" style="color:#b8b8b8">Your drawings are saved in your browser</p>
      <p id="fine" style="color:#333">A readable label</p>
      <button id="share" style="pointer-events:auto;background:#e3e2fe;color:#fff;border:0;padding:10px 16px;font-size:14px">Share</button>
    </div>
    <div id="cover" style="position:fixed;inset:0;z-index:2;${cover}"></div>${paint}`;

  test('contrast: text on a canvas, under a transparent layer, is measured from the screenshot', async () => {
    const issues = await detect(contrast, ui(''), { css });
    assert.deepEqual(sels(issues), ['#faint', '#share']);
    assert.equal(issues.find((i) => i.selector === '#faint').evidence.background, 'pixels');
    const faint = issues.find((i) => i.selector === '#faint');
    assert.ok(faint.evidence.contrastRatio > 1.8 && faint.evidence.contrastRatio < 2.1, `ratio ${faint.evidence.contrastRatio}`);
    assert.equal(faint.evidence.bgColor, '#ffffff');
  });

  test('contrast: text hidden under an opaque layer is not measured from pixels', async () => {
    // (#share keeps its own opaque background, so axe itself still reports it.)
    const issues = await detect(contrast, ui('background:#ffffff'), { css });
    assert.deepEqual(issues.filter((i) => i.evidence.background === 'pixels'), []);
  });

  test('theme-leak: on a canvas app the page background comes from the pixels', async () => {
    const island = `
      <canvas id="cv"></canvas>
      <h1 class="sr" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);color:#000">Whiteboard</h1>
      <div id="island" style="position:fixed;left:20px;bottom:20px;z-index:1;background:#ececf4;padding:8px 12px;width:160px;height:40px"><span class="zoom">100%</span></div>${paint}`;
    const islandCss = `${css} .zoom{color:#1b1b1f} @media (prefers-color-scheme: dark){.zoom{color:#e3e3e8}}`;
    const snaps = {};
    const pages = {};
    const contexts = [];
    for (const scheme of ['light', 'dark']) {
      const { context, page } = await open(htmlDoc(island, islandCss), { scheme });
      contexts.push(context);
      snaps[scheme] = await themeLeak.collect(page);
      pages[scheme] = page;
    }
    const cmp = themeLeak.compare(snaps.light, snaps.dark);
    const issues = await themeLeak.resolve(pages.dark, cmp.findings);
    for (const c of contexts) await c.close();
    assert.equal(cmp.flipped, true, `light ${cmp.lightBg}, dark ${cmp.darkBg}`);
    assert.deepEqual(issues.map((i) => [i.selector, i.evidence.kind, i.severity]), [['#island', 'container', 'error']]);
  });
});
