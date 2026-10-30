/**
 * `mantis perf`. The arithmetic (CLS session windows, TBT, unused bytes, CPU profile self time,
 * medians) is unit-tested; the measurement runs end to end against slow-app, an orders page with
 * planted problems behind test/helpers/slow-server.js: delayed APIs in a chain, a synchronous
 * script in <head>, a lazy-loaded hero image as the LCP element, a quadratic chart renderer, a
 * mostly unused bundle and a third-party chat widget on another origin.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { UsageError, parsePerfArgs } from '../src/options.js';
import { BUCKETS, bucketOf, findRouteIssues, impactOf, rankFindings, savingLabel } from '../src/perf/findings.js';
import { aggregate, attachServerWait, median, rating, renderPerfMarkdown, representative } from '../src/perf/index.js';
import { PERF_PROFILES, clsOf, hotFunctions, tbtOf, unusedJsBytes } from '../src/perf/measure.js';
import { siteOf } from '../src/perf/metrics.js';
import { apiPattern, appApis } from '../src/perf/network.js';
import { vendorOf } from '../src/perf/vendors.js';
import { runCli } from './helpers/cli.js';
import { FIXTURES } from './helpers/static-server.js';
import { startSlowServer } from './helpers/slow-server.js';

describe('perf arithmetic', () => {
  test('CLS is the largest session window, not the sum of all shifts', () => {
    assert.equal(clsOf([]), 0);
    // two shifts 500 ms apart form one window; one 1.5 s later starts another
    assert.equal(clsOf([{ t: 0, value: 0.05 }, { t: 500, value: 0.05 }, { t: 2000, value: 0.08 }]), 0.1);
    // a window ends after 5 s even when shifts keep coming every 900 ms
    const steady = Array.from({ length: 10 }, (_, i) => ({ t: i * 900, value: 0.02 }));
    assert.equal(clsOf(steady), 0.12);
  });

  test('TBT counts the part over 50 ms of each long task after FCP', () => {
    const tasks = [{ t: 0, duration: 200 }, { t: 300, duration: 120 }, { t: 600, duration: 40 }, { t: 900, duration: 51 }];
    assert.equal(tbtOf(tasks, 100), 71);
    assert.equal(tbtOf(tasks, null), 221);
  });

  test('unused JS bytes count nested never-run ranges once', () => {
    const functions = [
      { ranges: [{ startOffset: 0, endOffset: 1000, count: 1 }, { startOffset: 100, endOffset: 300, count: 0 }, { startOffset: 150, endOffset: 200, count: 0 }] },
      { ranges: [{ startOffset: 500, endOffset: 600, count: 0 }] },
      { ranges: [{ startOffset: 250, endOffset: 400, count: 0 }] },
    ];
    assert.equal(unusedJsBytes(functions), 200 + 100 + 100);
  });

  test('hot functions: self time per function from a CPU profile, app code only', () => {
    const node = (id, functionName, url, lineNumber = 0) => ({ id, callFrame: { functionName, url, lineNumber, columnNumber: 0 } });
    const cpu = {
      nodes: [node(1, '(root)', ''), node(2, '(program)', ''), node(3, 'renderAllPoints', 'http://x/app.js', 40), node(4, 'boot', 'http://v/w.js', 1), node(5, 'renderAllPoints', 'http://x/app.js', 40), node(6, 'tiny', 'http://x/app.js', 3)],
      samples: [3, 3, 5, 4, 2, 6],
      timeDeltas: [60000, 60000, 30000, 25000, 90000, 2000],
    };
    assert.deepEqual(hotFunctions(cpu), [
      { fn: 'renderAllPoints', url: 'http://x/app.js', line: 41, column: 1, self: 150 },
      { fn: 'boot', url: 'http://v/w.js', line: 2, column: 1, self: 25 },
    ]);
    assert.deepEqual(hotFunctions(null), []);
  });

  test('median, ratings and the representative visit', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([4, 1, 2, 3]), 2.5);
    assert.equal(median([]), null);
    assert.equal(rating('lcp', 2500), 'good');
    assert.equal(rating('lcp', 2501), 'needs-improvement');
    assert.equal(rating('cls', 0.3), 'poor');
    assert.equal(rating('load', 9000), null);
    const visits = [1800, 3000, 2100].map((lcp, i) => ({ metrics: { lcp, tbt: i * 100, cls: 0, bytes: 1000 } }));
    const agg = aggregate(visits);
    assert.deepEqual(agg.lcp, { median: 2100, min: 1800, max: 3000, values: [1800, 3000, 2100], rating: 'good' });
    assert.equal(agg.ttfb, undefined, 'a metric no visit has is left out');
    assert.equal(representative(visits, agg), 2);
  });

  test('server waits are matched by method, URL and order', () => {
    const throttled = [{ method: 'GET', url: 'http://x/api/a' }, { method: 'GET', url: 'http://x/api/a' }, { method: 'POST', url: 'http://x/api/a' }, { method: 'GET', url: 'http://x/b' }];
    const unthrottled = [{ method: 'GET', url: 'http://x/api/a', wait: 300 }, { method: 'POST', url: 'http://x/api/a', wait: 900 }, { method: 'GET', url: 'http://x/api/a', wait: 310 }];
    assert.deepEqual(attachServerWait(throttled, unthrottled).map((r) => r.serverWait), [300, 310, 900, null]);
  });
});

/** A measured route with nothing wrong; tests add one problem at a time. */
function route(over = {}, visitOver = {}) {
  const url = over.url ?? 'http://127.0.0.1:3000/';
  return {
    route: '/',
    url,
    status: 'ok',
    framework: null,
    devServer: false,
    metrics: aggregate([{ metrics: { lcp: 1500, fcp: 900, tbt: 50, cls: 0, bytes: 100000 } }]),
    ...over,
    visit: {
      lcp: 1500,
      fcp: 900,
      lcpElement: null,
      images: [],
      shifts: [],
      loafs: [],
      fonts: [],
      coverage: [],
      hotFunctions: [],
      requests: [{ url, method: 'GET', type: 'Document', start: 0, end: 100, bytes: 5000, serverWait: 50, mime: 'text/html' }],
      ...visitOver,
    },
  };
}
const mobile = PERF_PROFILES.mobile;
const desktop = PERF_PROFILES.desktop;

describe('findings', () => {
  test('impact: big savings, or crossing a Core Web Vitals threshold; already good caps at medium', () => {
    assert.equal(impactOf('lcp', 1400, 4800), 'high');
    assert.equal(impactOf('lcp', 300, 4100), 'high', 'poor → needs improvement');
    assert.equal(impactOf('lcp', 300, 3500), 'medium');
    assert.equal(impactOf('lcp', 2000, 2400), 'medium', 'already good');
    assert.equal(impactOf('tbt', 60, 230), 'low', 'crosses, but a small saving');
    assert.equal(impactOf('cls', 0.076, 0.121), 'high');
    assert.equal(impactOf('cls', 0, 0.121), 'low');
    assert.equal(impactOf('bytes', 193), 'medium');
    assert.equal(impactOf('bytes', 600), 'high');
  });

  test('buckets: do first is worth it and low risk; your call is a business decision', () => {
    assert.equal(bucketOf({ impact: 'medium', fixRisk: 'low' }), 'do-first');
    assert.equal(bucketOf({ impact: 'high', fixRisk: 'high' }), 'plan');
    assert.equal(bucketOf({ impact: 'medium', fixRisk: 'medium' }), 'plan');
    assert.equal(bucketOf({ impact: 'medium', fixRisk: 'high' }), 'nice');
    assert.equal(bucketOf({ impact: 'low', fixRisk: 'low' }), 'nice');
    assert.equal(bucketOf({ impact: 'high', fixRisk: 'low', decision: true }), 'your-call');
    assert.deepEqual(BUCKETS.map((b) => b.id), ['do-first', 'plan', 'nice', 'your-call']);
  });

  test('a clean route has nothing to fix', () => {
    assert.deepEqual(findRouteIssues(route(), mobile), []);
  });

  test('LCP image savings stop at LCP − FCP: nothing done to the image paints before the first paint', () => {
    const e = { selector: 'img.hero', tag: 'img', url: 'http://127.0.0.1:3000/hero.jpg', srcAttr: '/hero.jpg', loading: 'lazy', inHtml: true, preloaded: false, rect: { width: 400, height: 200 }, natural: { width: 400, height: 200 } };
    const req = { url: e.url, method: 'GET', type: 'Image', start: 900, end: 1400, bytes: 30000, mime: 'image/jpeg' };
    const tight = findRouteIssues(route({}, { lcp: 1000, fcp: 980, lcpElement: e, requests: [route().visit.requests[0], req] }), mobile);
    assert.deepEqual(tight, [], 'only 20 ms between first paint and LCP');
    const [lazy] = findRouteIssues(route({}, { lcp: 2000, fcp: 900, lcpElement: e, requests: [route().visit.requests[0], req] }), mobile);
    assert.equal(lazy.category, 'lcp-lazy');
    assert.equal(lazy.savings.ms, 800);
    assert.match(lazy.evidence, /started 800 ms after the HTML arrived/);
  });

  test('an LCP image a script puts in the page is found late; next/image is the Next.js fix', () => {
    const e = { selector: 'img.hero', tag: 'img', url: 'http://127.0.0.1:3000/hero.jpg', srcAttr: '/hero.jpg', loading: null, inHtml: false, preloaded: false, rect: { width: 400, height: 200 }, natural: { width: 400, height: 200 } };
    const req = { url: e.url, method: 'GET', type: 'Image', start: 1500, end: 1900, bytes: 30000, mime: 'image/jpeg' };
    const [f] = findRouteIssues(route({ framework: 'next' }, { lcp: 3000, fcp: 900, lcpElement: e, requests: [route().visit.requests[0], req] }), mobile);
    assert.equal(f.category, 'lcp-discovery');
    assert.match(f.evidence, /not in the HTML the server sends/);
    assert.match(f.fix, /rel="preload" as="image" href="\/hero\.jpg"/);
    assert.deepEqual(f.frameworkFix.framework, 'next');
    assert.match(f.frameworkFix.text, /priority/);
  });

  test('only first-party code is a long task here; a vendor is grouped by vendor', () => {
    const hot = [
      { fn: 'renderGrid', url: 'http://127.0.0.1:3000/app.js', line: 12, column: 1, self: 90 },
      { fn: 'boot', url: 'http://127.0.0.1:9999/widget.js', line: 1, column: 1, self: 300 },
      { fn: 'tiny', url: 'http://127.0.0.1:3000/app.js', line: 40, column: 1, self: 10 },
    ];
    const found = findRouteIssues(route({}, { hotFunctions: hot }), mobile);
    assert.deepEqual(found.map((f) => [f.category, f.culprit.fn]), [['long-task', 'renderGrid']]);
    assert.equal(found[0].savings.ms, 90 * 4 - 50);
    assert.deepEqual(findRouteIssues(route({}, { hotFunctions: hot }), desktop), [], '90 ms unthrottled is under the bar without a long frame');
  });

  test('a slow server, hiding fonts, unused CSS and uncompressed text (away from localhost)', () => {
    const url = 'https://shop.example.com/';
    const doc = { url, method: 'GET', type: 'Document', start: 0, end: 1400, bytes: 40000, serverWait: 1300, mime: 'text/html' };
    const font = { url: 'https://shop.example.com/brand.woff2', method: 'GET', type: 'Font', start: 1500, end: 2600, bytes: 30000, mime: 'font/woff2', encoding: null };
    const js = { url: 'https://cdn.example.com/app.js', method: 'GET', type: 'Script', start: 1400, end: 1900, bytes: 300000, mime: 'application/javascript' };
    const metrics = aggregate([{ metrics: { lcp: 4500, fcp: 2600, tbt: 50, cls: 0, bytes: 400000 } }]);
    const found = findRouteIssues(route({ url, metrics }, {
      lcp: 4500,
      fcp: 2600,
      requests: [doc, font, js],
      fonts: [{ family: 'Brand', display: 'auto', status: 'loaded' }],
      coverage: [{ url: 'https://shop.example.com/site.css', type: 'css', total: 80000, unused: 70000 }],
    }), mobile);
    const by = Object.fromEntries(found.map((f) => [f.category, f]));
    assert.deepEqual(Object.keys(by).sort(), ['font', 'server', 'transfer', 'unused-code']);
    assert.equal(by.server.fixRisk, 'high');
    assert.equal(by.server.savings.ms, 1100);
    assert.equal(by.server.bucket, 'plan');
    assert.match(by.font.title, /Brand/);
    assert.equal(by.font.savings.ms, 1100, 'hidden from the font request until it arrives');
    assert.match(by.font.fix, /font-display: swap/);
    assert.match(by['unused-code'].fix, /unused rules/);
    assert.match(by.transfer.evidence, /cdn\.example\.com\/app\.js/, 'another subdomain of the same site is first-party');
    const local = findRouteIssues(route({}, { requests: [{ ...doc, url: 'http://127.0.0.1:3000/', serverWait: 50 }, { ...js, url: 'http://127.0.0.1:3000/app.js' }] }), mobile);
    assert.deepEqual(local, [], 'local servers rarely compress like production');
  });

  test('layout shifts: grouped by cause, and a cause saves only what CLS would drop without it', () => {
    const shifts = [
      { t: 500, value: 0.12, sources: ['h1'], cause: { kind: 'unsized-image', selector: 'img.hero', t: null } },
      { t: 4000, value: 0.04, sources: ['main'], cause: { kind: 'inserted', selector: 'div.promo', t: 3990 } },
    ];
    const found = findRouteIssues(route({ metrics: aggregate([{ metrics: { lcp: 1500, fcp: 900, tbt: 50, cls: 0.12 } }]) }, { shifts }), mobile);
    const hero = found.find((f) => f.culprit.selector === 'img.hero');
    const promo = found.find((f) => f.culprit.selector === 'div.promo');
    assert.equal(hero.savings.cls, 0.08);
    assert.equal(hero.confidence, 'estimated', 'the image was found by position, not by time');
    const fitted = findRouteIssues(route({}, { shifts: [{ ...shifts[0], cause: { ...shifts[0].cause, moved: 258, fits: true } }] }), mobile)[0];
    assert.equal(fitted.confidence, 'measured', 'the content moved exactly the image\'s height');
    assert.match(fitted.evidence, /258 px down, as tall as `img\.hero`/);
    assert.equal(hero.bucket, 'do-first');
    assert.equal(promo.savings.cls, 0);
    assert.equal(promo.bucket, 'nice');
    assert.equal(savingLabel(promo), 'shift 0.04');
    assert.match(promo.evidence, /comes from a worse burst of shifts/);
  });

  test('ranking merges a culprit found on two routes and orders by bucket, then score', () => {
    const a = { id: 'x:1', bucket: 'plan', score: 1, metric: 'tbt', savings: { ms: 300 }, routes: ['/'] };
    const b = { id: 'x:1', bucket: 'plan', score: 1.5, metric: 'tbt', savings: { ms: 450 }, routes: ['/b'] };
    const c = { id: 'y:1', bucket: 'do-first', score: 0.2, metric: 'lcp', savings: { ms: 100 }, routes: ['/'] };
    const d = { id: 'z:1', bucket: 'plan', score: 2, metric: 'bytes', savings: { kb: 900 }, routes: ['/'] };
    const ranked = rankFindings([[a, c], [b, d]]);
    assert.deepEqual(ranked.map((f) => f.id), ['y:1', 'z:1', 'x:1']);
    assert.deepEqual(ranked[2].routes, ['/', '/b']);
    assert.equal(ranked[2].savings.ms, 450, 'the larger estimate is kept');
  });

  test('API calls: own site, or an unknown host the app itself calls; ids collapse into a pattern', () => {
    const page = 'https://shop.example.com/';
    const own = { initiator: { url: 'https://shop.example.com/app.js' } };
    const reqs = [
      { url: 'https://api.example.com/v1/cart', type: 'Fetch', ...own },
      { url: 'https://shop-backend.fly.dev/orders', type: 'XHR', ...own },
      { url: 'https://www.google-analytics.com/g/collect', type: 'Fetch', ...own },
      { url: 'https://unknown-vendor.io/ping', type: 'Fetch', initiator: { url: 'https://unknown-vendor.io/sdk.js' } },
      { url: 'https://shop.example.com/app.js', type: 'Script' },
    ];
    assert.deepEqual(appApis(reqs, page).map((q) => new URL(q.url).host), ['api.example.com', 'shop-backend.fly.dev']);
    assert.equal(apiPattern('https://x.io/api/products/42?user=7&sort=asc'), '/api/products/:id?sort=asc&user=:id');
    assert.equal(apiPattern('https://x.io/u/3f2b8c1e-1a2b-4c3d-8e9f-001122334455/avatar'), '/u/:id/avatar');
    assert.deepEqual(vendorOf('https://widget.intercom.io/widget/abc'), { id: 'Intercom', name: 'Intercom', category: 'chat' });
    assert.equal(vendorOf('https://fonts.googleapis.com/css2?family=Inter').name, 'Google Fonts');
    assert.equal(vendorOf('https://maps.googleapis.com/maps/api/js').name, 'Google Maps');
    assert.deepEqual(vendorOf('https://cdn.acme-widgets.com/w.js'), { id: 'acme-widgets.com', name: 'acme-widgets.com', category: 'other' });
  });

  test('API findings: slow, chain, duplicate, N+1 and payload, each traced to the code that called it', () => {
    const base = 'https://shop.example.com';
    const call = (path, start, end, extra = {}) => ({
      url: `${base}${path}`, method: 'GET', type: 'Fetch', start, end, duration: end - start, bytes: 2000, encoding: 'br', serverWait: 80,
      initiator: { type: 'script', url: `${base}/app.js`, line: 10, fn: 'load', frames: [{ fn: 'load', url: `${base}/app.js`, line: 10 }, { fn: 'main', url: `${base}/app.js`, line: 40 }] },
      ...extra,
    });
    const doc = { url: `${base}/`, method: 'GET', type: 'Document', start: 0, end: 200, bytes: 9000, serverWait: 100, encoding: 'br', mime: 'text/html' };
    const app = { url: `${base}/app.js`, method: 'GET', type: 'Script', start: 210, end: 400, bytes: 9000, encoding: 'br', mime: 'text/javascript' };
    const requests = [
      doc, app,
      call('/api/me', 420, 1300, { serverWait: 850 }),
      call('/api/cart', 1310, 1500),
      ...[1, 2, 3, 4].map((id) => call(`/api/items/${id}`, 1510, 1700)),
      call('/api/cart', 1720, 1900),
      call('/api/feed', 420, 900, { bytes: 300 * 1024 }),
    ];
    const found = findRouteIssues(route({ url: `${base}/`, metrics: aggregate([{ metrics: { lcp: 1500, fcp: 600, tbt: 0, cls: 0, data: 1900 } }]) }, { lcp: 1500, fcp: 600, requests }), desktop);
    const by = (c) => found.filter((f) => f.category === c);
    assert.equal(by('api-slow').length, 1);
    assert.match(by('api-slow')[0].title, /GET \/api\/me takes 850 ms on the server/);
    assert.equal(by('api-slow')[0].fixRisk, 'high');
    const [chain] = by('api-chain');
    assert.match(chain.title, /\/api\/me → \/api\/cart → \/api\/items\/:id → \/api\/cart/);
    assert.equal(chain.savings.ms, 1900 - 420 - 880);
    const [dup] = by('api-duplicate');
    assert.match(dup.title, /GET \/api\/cart is called 2 times/);
    assert.equal(dup.savings.ms, 180);
    assert.match(dup.evidence, /`load` \/app\.js:10 ← `main` \/app\.js:40/);
    const [n1] = by('api-n-plus-1');
    assert.match(n1.title, /4 calls to \/api\/items\/:id, one per item/);
    assert.match(n1.fix, /\/api\/items\?ids=1,2,3/);
    const [payload] = by('api-payload');
    assert.match(payload.title, /\/api\/feed sends 300 KB/);
    assert.deepEqual(by('api-late'), [], 'the first call starts right after its script arrives');
  });

  test('vendors: grouped, with a facade for chat, render-blocking fonts, and a business decision when costly', () => {
    const page = 'http://127.0.0.1:3000/';
    const doc = { url: page, method: 'GET', type: 'Document', start: 0, end: 100, bytes: 5000, mime: 'text/html' };
    const requests = [
      doc,
      { url: 'https://fonts.googleapis.com/css2?family=Inter', method: 'GET', type: 'Stylesheet', start: 110, end: 700, bytes: 1500, renderBlocking: true },
      { url: 'https://fonts.gstatic.com/s/inter.woff2', method: 'GET', type: 'Font', start: 710, end: 900, bytes: 48000 },
      { url: 'https://widget.intercom.io/widget/abc', method: 'GET', type: 'Script', start: 300, end: 800, bytes: 90000, initiator: { url: page, line: 12 } },
      { url: 'https://js.intercomcdn.com/frame.js', method: 'GET', type: 'Script', start: 820, end: 1200, bytes: 250000 },
    ];
    const scriptTime = [{ url: 'https://js.intercomcdn.com/frame.js', self: 120 }, { url: 'https://widget.intercom.io/widget/abc', self: 10 }];
    const found = findRouteIssues(route({}, { fcp: 750, requests, scriptTime }), mobile);
    const fonts = found.find((f) => f.category === 'third-party' && f.vendor.name === 'Google Fonts');
    assert.equal(fonts.metric, 'fcp');
    assert.equal(fonts.savings.ms, 600);
    assert.match(fonts.fix, /Self-host/);
    const chat = found.find((f) => f.category === 'third-party' && f.vendor.name === 'Intercom');
    assert.equal(chat.vendor.mainThreadMs, 520);
    assert.equal(chat.vendor.requests, 2);
    assert.match(chat.title, /Intercom \(chat\): 520 ms of main thread, 332 KB/);
    assert.match(chat.fix, /facade/);
    assert.equal(chat.culprit.from, `${page}:12`);
    const cost = found.find((f) => f.category === 'third-party-cost');
    assert.equal(cost.bucket, 'your-call');
    assert.match(cost.title, /Is Intercom worth 520 ms of main thread and 332 KB on every visit\?/);
    assert.ok(!found.some((f) => f.category === 'render-blocking'), 'a vendor\'s blocking file is part of its own finding');
  });

  test('a first API call made late is traced to the script it waited for', () => {
    const page = 'http://127.0.0.1:3000/';
    const requests = [
      { url: page, method: 'GET', type: 'Document', start: 0, end: 100 },
      { url: `${page}vendor.js`, method: 'GET', type: 'Script', start: 110, end: 2400, bytes: 900000 },
      { url: `${page}app.js`, method: 'GET', type: 'Script', start: 110, end: 300, bytes: 4000 },
      { url: `${page}api/me`, method: 'GET', type: 'Fetch', start: 2420, end: 2600, duration: 180, serverWait: 50, initiator: { url: `${page}app.js`, line: 3, fn: 'boot' } },
    ];
    const [late] = findRouteIssues(route({}, { requests }), desktop).filter((f) => f.category === 'api-late');
    assert.equal(late.savings.ms, 2120);
    assert.equal(late.culprit.waitedFor, `${page}vendor.js`);
    assert.match(late.evidence, /after \/vendor\.js finished loading \(2\.4 s\) and ran/);
    assert.match(late.fix, /rel="preload" as="fetch" href="\/api\/me"/);
  });

  test('siteOf tells first-party from third-party', () => {
    assert.equal(siteOf('https://cdn.example.com/a.js'), 'example.com');
    assert.equal(siteOf('https://a.shop.example.co.uk/'), 'example.co.uk');
    assert.equal(siteOf('http://127.0.0.1:4330/x'), '127.0.0.1:4330');
    assert.equal(siteOf('http://localhost:3000/'), 'localhost:3000');
  });
});

describe('parsePerfArgs', () => {
  test('defaults', () => {
    const o = parsePerfArgs(['localhost:3000/shop']);
    assert.equal(o.url, 'http://localhost:3000/shop');
    assert.deepEqual(o.routes, ['/shop']);
    assert.equal(o.runs, 5);
    assert.equal(o.profile, 'mobile');
    assert.equal(o.timeout, 60000);
    assert.equal(o.out, '.mantis');
    assert.equal(o.storageState, null);
  });

  test('bad input is a usage error', () => {
    assert.throws(() => parsePerfArgs([]), UsageError);
    assert.throws(() => parsePerfArgs(['http://x', '--runs', '0']), /--runs must be between 1 and 15/);
    assert.throws(() => parsePerfArgs(['http://x', '--profile', 'tablet']), /unknown --profile "tablet"/);
    assert.throws(() => parsePerfArgs(['http://x', '--viewports', 'mobile']), UsageError);
    assert.throws(() => parsePerfArgs(['http://x', '--baseline', 'none']), UsageError, 'not until perf baselines exist');
  });
});

test('renderPerfMarkdown: notes, failed routes and a minimal visit', () => {
  const md = renderPerfMarkdown({
    url: 'http://x/',
    profile: { name: 'desktop', label: 'desktop (no throttling)' },
    runs: 1,
    durationMs: 4000,
    routes: [
      { route: '/gone', url: 'http://x/gone', status: 'failed', notes: ['visit 1 failed: net::ERR_CONNECTION_REFUSED'] },
      {
        route: '/',
        url: 'http://x/',
        status: 'ok',
        notes: ['Measured a development server (Vite dev server (/@vite/client)): its numbers are not what users get.'],
        metrics: aggregate([{ metrics: { lcp: 900, cls: 0, bytes: 512 } }]),
        visit: { lcpElement: null, requests: [], loafs: [], coverage: [], hotFunctions: [] },
      },
    ],
  });
  assert.match(md, /median of 1 cold visit per route/);
  assert.match(md, /> visit 1 failed: net::ERR_CONNECTION_REFUSED/);
  assert.match(md, /> Measured a development server/);
  assert.match(md, /\| LCP \| 900 ms \| 900 ms – 900 ms \| good \|/);
  assert.match(md, /\| transferred \| 512 B \|/);
});

describe('mantis perf on slow-app (end-to-end)', { concurrency: false }, () => {
  let tmp;
  let server;
  let desktop;
  let mobile;
  let md;
  let mobileMd;
  let mobileStdout;
  const route = (report, r) => report.routes.find((x) => x.route === r);
  const req = (visit, re) => visit.requests.find((q) => re.test(q.url));

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-perf-'));
    server = await startSlowServer();
    let res = await runCli(['perf', `${server.url}/`, '--routes', '/,/fast,/dev', '--runs', '2', '--profile', 'desktop', '--out', path.join(tmp, 'd')]);
    assert.equal(res.code, 1, res.stderr);
    assert.match(res.stdout, /report {2}.*perf\.md/);
    desktop = JSON.parse(readFileSync(path.join(tmp, 'd', 'perf', 'latest', 'perf.json'), 'utf8'));
    md = readFileSync(path.join(tmp, 'd', 'perf', 'latest', 'perf.md'), 'utf8');
    res = await runCli(['perf', `${server.url}/`, '--runs', '1', '--out', path.join(tmp, 'm')]);
    assert.equal(res.code, 1, res.stderr);
    mobileStdout = res.stdout;
    mobile = JSON.parse(readFileSync(path.join(tmp, 'm', 'perf', 'latest', 'perf.json'), 'utf8'));
    mobileMd = readFileSync(path.join(tmp, 'm', 'perf', 'latest', 'perf.md'), 'utf8');
  });

  after(async () => {
    await server?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  test('every metric is the median of the runs, with its spread', () => {
    const m = route(desktop, '/').metrics;
    for (const k of ['lcp', 'fcp', 'tbt', 'cls', 'ttfb', 'bytes', 'requests']) assert.equal(m[k].values.length, 2, k);
    assert.equal(desktop.kind, 'perf');
    assert.equal(desktop.profile.name, 'desktop');
  });

  test('the lazy-loaded hero image is the LCP element', () => {
    const e = route(desktop, '/').visit.lcpElement;
    assert.match(e.selector, /hero/);
    assert.equal(e.loading, 'lazy');
    assert.match(e.url, /\/hero\.png$/);
  });

  test('requests: render-blocking script, the user → orders chain and who made each call', () => {
    const v = route(desktop, '/').visit;
    assert.equal(req(v, /\/flags\.js$/).renderBlocking, true);
    const user = req(v, /\/api\/user$/);
    const orders = req(v, /\/api\/orders/);
    assert.ok(orders.start >= user.end - 5, `orders starts at ${orders.start}, user ends at ${user.end}`);
    assert.equal(orders.initiator.fn, 'loadOrders');
    assert.match(orders.initiator.url, /\/app\.js$/);
    assert.ok(orders.serverWait >= 450, `server wait ${orders.serverWait}`);
    const widget = req(v, /\/widget\.js$/);
    assert.notEqual(new URL(widget.url).origin, new URL(server.url).origin);
    assert.equal(v.requests.filter((q) => /\/api\/config$/.test(q.url)).length, 2, 'the duplicate fetch is kept');
  });

  test('the CPU profile names the app function and the vendor function that block the main thread', () => {
    const hot = route(desktop, '/').visit.hotFunctions;
    const chart = hot.find((f) => f.fn === 'renderAllPoints');
    assert.ok(chart, JSON.stringify(hot));
    assert.match(chart.url, /\/app\.js$/);
    assert.ok(hot.some((f) => f.fn === 'bootChatWidget' && f.url === `${server.vendorUrl}/widget.js`), JSON.stringify(hot));
    assert.match(md, /`renderAllPoints` \/app\.js:\d+/);
  });

  test('coverage: the bundle that ships every feature mostly never runs', () => {
    const big = route(desktop, '/').visit.coverage.find((c) => /\/big\.js$/.test(c.url));
    assert.ok(big.unused / big.total > 0.9, JSON.stringify(big));
  });

  test('a lean page measures lean, and a dev server is called out', () => {
    const fast = route(desktop, '/fast');
    assert.equal(fast.metrics.requests.median, 1);
    assert.equal(fast.metrics.tbt.median, 0);
    assert.equal(fast.devServer, false);
    const dev = route(desktop, '/dev');
    assert.equal(dev.devServer, true);
    assert.match(dev.notes[0], /development server \(Vite dev server/);
  });

  test('the mobile profile is throttled: slower, and the hero is far larger than it is drawn', () => {
    const m = route(mobile, '/');
    const d = route(desktop, '/');
    assert.equal(mobile.profile.name, 'mobile');
    // Slow 4G adds 562 ms to every round trip; a ratio would depend on how fast the machine is.
    assert.ok(m.metrics.fcp.median > d.metrics.fcp.median + 400, `mobile FCP ${m.metrics.fcp.median} vs desktop ${d.metrics.fcp.median}`);
    assert.ok(m.metrics.lcp.median > d.metrics.lcp.median + 1000, `mobile LCP ${m.metrics.lcp.median} vs desktop ${d.metrics.lcp.median}`);
    assert.ok(m.metrics.tbt.median > d.metrics.tbt.median, `mobile TBT ${m.metrics.tbt.median} vs desktop ${d.metrics.tbt.median}`);
    const e = m.visit.lcpElement;
    assert.ok(e.natural.width >= 2 * e.rect.width, JSON.stringify(e));
  });

  test('every planted problem with an expected finding is reported, in its bucket (mobile)', () => {
    const planted = JSON.parse(readFileSync(path.join(FIXTURES, 'slow-app', 'PLANTED.json'), 'utf8'));
    const all = JSON.stringify(mobile.findings.map((f) => [f.bucket, f.category, f.culprit]), null, 1);
    for (const p of planted.problems.filter((x) => x.finding)) {
      const want = p.finding;
      const match = mobile.findings.find((f) => f.category === want.category
        && Object.entries(want.culprit ?? {}).every(([k, re]) => new RegExp(re).test(f.culprit[k] ?? ''))
        && (!want.fix || new RegExp(want.fix).test(f.fix)));
      assert.ok(match, `${p.id}: no ${want.category} finding matching ${JSON.stringify(want)}\n${all}`);
      if (want.bucket) assert.equal(match.bucket, want.bucket, `${p.id} is in ${match.bucket}`);
      assert.deepEqual(match.routes, ['/']);
    }
  });

  test('findings are ranked by bucket, the vendor is left to the third-party findings, and the report leads with fixes', () => {
    const order = BUCKETS.map((b) => b.id);
    const idx = mobile.findings.map((f) => order.indexOf(f.bucket));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
    const vendorBlamed = mobile.findings.filter((f) => /widget\.js/.test(JSON.stringify(f.culprit))).map((f) => f.category);
    assert.deepEqual(vendorBlamed.sort(), ['third-party', 'third-party-cost'], 'the vendor shows up as a vendor only');
    const vendor = mobile.findings.find((f) => f.category === 'third-party');
    assert.ok(vendor.vendor.mainThreadMs > 250, JSON.stringify(vendor.vendor));
    assert.equal(route(mobile, '/').metrics.data.values.length, 1, 'when the API data was in is a metric');
    assert.equal(mobile.summary.findings, mobile.findings.length);
    assert.ok(mobileMd.indexOf('## Fixes, ranked') < mobileMd.indexOf('## `/`'));
    assert.match(mobileMd, /### Do first \(worth it, low risk\)/);
    assert.match(mobileStdout, /Fixes: \d+ do first · \d+ plan/);
  });

  test('a lean page has nothing to fix', () => {
    assert.ok(!desktop.findings.some((f) => f.routes.includes('/fast')), JSON.stringify(desktop.findings.filter((f) => f.routes.includes('/fast'))));
  });
});
