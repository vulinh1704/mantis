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
import { aggregate, attachServerWait, median, rating, renderPerfMarkdown, representative } from '../src/perf/index.js';
import { clsOf, hotFunctions, tbtOf, unusedJsBytes } from '../src/perf/measure.js';
import { runCli } from './helpers/cli.js';
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
  const route = (report, r) => report.routes.find((x) => x.route === r);
  const req = (visit, re) => visit.requests.find((q) => re.test(q.url));

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-perf-'));
    server = await startSlowServer();
    let res = await runCli(['perf', `${server.url}/`, '--routes', '/,/fast,/dev', '--runs', '2', '--profile', 'desktop', '--out', path.join(tmp, 'd')]);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /report {2}.*perf\.md/);
    desktop = JSON.parse(readFileSync(path.join(tmp, 'd', 'perf', 'latest', 'perf.json'), 'utf8'));
    md = readFileSync(path.join(tmp, 'd', 'perf', 'latest', 'perf.md'), 'utf8');
    res = await runCli(['perf', `${server.url}/`, '--runs', '1', '--out', path.join(tmp, 'm')]);
    assert.equal(res.code, 0, res.stderr);
    mobile = JSON.parse(readFileSync(path.join(tmp, 'm', 'perf', 'latest', 'perf.json'), 'utf8'));
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
    assert.ok(m.metrics.lcp.median > d.metrics.lcp.median * 2, `mobile LCP ${m.metrics.lcp.median} vs desktop ${d.metrics.lcp.median}`);
    assert.ok(m.metrics.tbt.median > d.metrics.tbt.median, `mobile TBT ${m.metrics.tbt.median} vs desktop ${d.metrics.tbt.median}`);
    const e = m.visit.lcpElement;
    assert.ok(e.natural.width >= 2 * e.rect.width, JSON.stringify(e));
  });
});
