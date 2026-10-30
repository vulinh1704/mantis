/**
 * `mantis perf` against a baseline. The arithmetic (noise, receipts, emptier pages) is unit-tested;
 * end to end, slow-app is measured as it is, then fixed at the root (fixed.html: same content, every
 * planted problem gone), then "optimized" by removing what was slow (emptied.html), each run
 * compared with the one before.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { UsageError, parsePerfArgs } from '../src/options.js';
import { comparePerf, emptierReasons, findPerfBaseline, metricDelta, receipt } from '../src/perf/compare.js';
import { aggregate } from '../src/perf/index.js';
import { runCli } from './helpers/cli.js';
import { startSlowServer } from './helpers/slow-server.js';

const stats = (values) => aggregate(values.map((v) => ({ metrics: { lcp: v } }))).lcp;

describe('perf comparison', () => {
  test('a change counts only beyond the noise: both runs\' spread, 5%, and a floor', () => {
    assert.equal(metricDelta('lcp', stats([4800]), stats([1900])).significant, true);
    assert.equal(metricDelta('lcp', stats([2000]), stats([1950])).significant, false, 'under the 100 ms floor');
    assert.equal(metricDelta('lcp', stats([2000, 2600, 2300]), stats([1800, 2000, 1900])).significant, false, 'within the 600 ms spread');
    const d = metricDelta('lcp', stats([4800, 5000, 4900]), stats([1900, 2000, 2100]));
    assert.deepEqual({ ...d }, { before: 4900, after: 2000, delta: -2900, noise: 245, significant: true, better: true });
    assert.equal(metricDelta('lcp', null, stats([1])), null);
  });

  test('the receipt: significant changes with arrows, the rest as ≈', () => {
    const deltas = {
      lcp: metricDelta('lcp', stats([4800]), stats([1900])),
      tbt: { before: 210, after: 200, delta: -10, noise: 50, significant: false, better: true },
    };
    assert.equal(receipt(deltas, 9, 0, 0), 'LCP 4.8 s → 1.9 s · TBT ≈ 200 ms · 9 fixed · 0 new · 0 cover-ups');
    assert.equal(receipt({}, 0, 1, 1), '0 fixed · 1 new · 1 cover-up');
  });

  test('emptier: the LCP image became text, text cut, images, headings and controls gone', () => {
    const before = { lcpElement: { selector: 'img.hero', tag: 'img', url: 'http://x/hero.jpg', rect: { width: 400, height: 250 } }, inventory: { textLength: 1000, viewportImages: 2, headings: 3, controls: 10 } };
    const same = emptierReasons(before, before, 'http://x');
    assert.deepEqual(same, []);
    const after = { lcpElement: { selector: 'h1', tag: 'h1', url: null, text: 'Your orders', rect: { width: 380, height: 40 } }, inventory: { textLength: 300, viewportImages: 0, headings: 1, controls: 4 } };
    const reasons = emptierReasons(before, after, 'http://x');
    assert.equal(reasons.length, 5);
    assert.match(reasons[0], /the LCP element was an image \(`img\.hero`, \/hero\.jpg\) and is now h1 text "Your orders"/);
    assert.match(reasons[1], /visible text dropped from 1000 to 300 characters \(−70%\)/);
    assert.match(reasons[2], /2 of 2 images on the first screen are gone/);
    const smaller = { ...before, lcpElement: { ...before.lcpElement, rect: { width: 100, height: 60 } } };
    assert.match(emptierReasons(before, smaller, 'http://x')[0], /shrank from 400×250 to 100×60/);
  });

  test('a route that got faster and emptier is a cover-up; what left with its content is not "fixed"', () => {
    const route = (lcp, inventory, lcpElement) => ({ route: '/', metrics: { lcp: stats([lcp]) }, visit: { inventory, lcpElement } });
    const inv = { textLength: 900, viewportImages: 1, headings: 2, controls: 6 };
    const hero = { selector: 'img.hero', tag: 'img', url: 'http://x/hero.jpg', rect: { width: 400, height: 250 } };
    const f = (id) => ({ id, title: id, routes: ['/'] });
    const base = { dir: '/b', report: { runId: 'r1', routes: [route(4800, inv, hero)], findings: [f('image-oversized:hero'), f('long-task:x')] } };
    const emptied = comparePerf(base, { url: 'http://x/', routes: [route(900, { ...inv, textLength: 100, viewportImages: 0 }, { selector: 'h1', tag: 'h1', url: null, text: 'Hi', rect: { width: 300, height: 40 } })], findings: [] });
    assert.equal(emptied.coverUps.length, 1);
    assert.deepEqual(emptied.coverUps[0].improved, ['LCP 4.8 s → 900 ms']);
    assert.deepEqual(emptied.fixed, []);
    assert.deepEqual(emptied.goneWithContent.map((x) => x.id), ['image-oversized:hero', 'long-task:x']);
    const honest = comparePerf(base, { url: 'http://x/', routes: [route(1900, inv, hero)], findings: [f('new:y')] });
    assert.deepEqual(honest.coverUps, []);
    assert.deepEqual(honest.fixed.map((x) => x.id), ['image-oversized:hero', 'long-task:x']);
    assert.deepEqual(honest.new.map((x) => x.id), ['new:y']);
    assert.equal(honest.receipt, 'LCP 4.8 s → 1.9 s · 2 fixed · 1 new · 0 cover-ups');
  });

  test('baseline: auto takes the latest run of the same URL, profile and storage state; a given run must match the profile', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-perf-base-'));
    try {
      const write = async (name, report) => {
        await mkdir(path.join(tmp, 'perf', 'runs', name), { recursive: true });
        await writeFile(path.join(tmp, 'perf', 'runs', name, 'perf.json'), JSON.stringify({ runId: name, routes: [], findings: [], ...report }));
      };
      await write('2026-10-30T10-00-00', { url: 'http://x/', profile: { name: 'mobile' }, storageState: null });
      await write('2026-10-30T11-00-00', { url: 'http://x/', profile: { name: 'desktop' }, storageState: null });
      await write('2026-10-30T12-00-00', { url: 'http://x/', profile: { name: 'mobile' }, storageState: 'admin.json' });
      await write('2026-10-30T13-00-00', { url: 'http://y/', profile: { name: 'mobile' }, storageState: null });
      const find = (o) => findPerfBaseline({ out: tmp, url: 'http://x/', profile: 'mobile', storageState: null, ...o });
      assert.equal((await find({})).report.runId, '2026-10-30T10-00-00');
      assert.equal((await find({ profile: 'desktop' })).report.runId, '2026-10-30T11-00-00');
      assert.equal((await find({ storageState: '/home/me/admin.json' })).report.runId, '2026-10-30T12-00-00');
      assert.equal(await find({ baseline: 'none' }), null);
      assert.equal(await find({ url: 'http://z/' }), null);
      await assert.rejects(find({ baseline: path.join(tmp, 'perf', 'runs', '2026-10-30T11-00-00') }), /measured with --profile desktop, this run with mobile/);
      await assert.rejects(find({ baseline: path.join(tmp, 'nope') }), UsageError);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  test('parsePerfArgs takes --baseline', () => {
    assert.equal(parsePerfArgs(['http://x']).baseline, 'auto');
    assert.equal(parsePerfArgs(['http://x', '--baseline', 'none']).baseline, 'none');
    assert.throws(() => parsePerfArgs(['http://x', '--baseline', ' ']), /--baseline is empty/);
  });
});

describe('mantis perf: fixed at the root vs emptied (end-to-end)', { concurrency: false }, () => {
  let tmp;
  let server;
  const runs = {};
  const read = (dir) => JSON.parse(readFileSync(path.join(dir, 'perf', 'latest', 'perf.json'), 'utf8'));

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-perf-cmp-'));
    server = await startSlowServer();
    const out = path.join(tmp, 'out');
    const args = ['perf', `${server.url}/`, '--runs', '1', '--profile', 'desktop', '--out', out];
    for (const variant of [null, 'fixed', 'emptied']) {
      server.setVariant(variant);
      const res = await runCli(args);
      runs[variant ?? 'original'] = { code: res.code, stdout: res.stdout, stderr: res.stderr, report: read(out), md: readFileSync(path.join(out, 'perf', 'latest', 'perf.md'), 'utf8') };
    }
  });

  after(async () => {
    await server?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  test('the first run has nothing to compare with', () => {
    const r = runs.original;
    assert.equal(r.code, 1, r.stderr);
    assert.equal(r.report.baseline, null);
    assert.doesNotMatch(r.md, /## Compared with/);
  });

  test('fixed at the root: faster, the planted findings fixed, nothing new, no cover-up, exit 0', () => {
    const r = runs.fixed;
    const b = r.report.baseline;
    assert.equal(b.runId, runs.original.report.runId);
    assert.deepEqual(b.coverUps, []);
    assert.deepEqual(b.new, [], JSON.stringify(b.new));
    assert.ok(b.fixed.length >= 8, JSON.stringify(b.fixed.map((f) => f.id)));
    for (const cat of ['lcp-lazy', 'cls-source', 'api-chain', 'api-duplicate', 'third-party', 'unused-code']) {
      assert.ok(b.fixed.some((f) => f.id.startsWith(`${cat}:`)), `${cat} fixed: ${JSON.stringify(b.fixed.map((f) => f.id))}`);
    }
    const d = b.routes[0].deltas;
    assert.ok(d.lcp.significant && d.lcp.better, JSON.stringify(d.lcp));
    assert.ok(d.cls.significant && d.cls.better, JSON.stringify(d.cls));
    assert.match(b.receipt, /^LCP .+ → .+ · .*\d+ fixed · 0 new · 0 cover-ups$/);
    assert.equal(r.code, 0, `${r.stdout}\n${JSON.stringify(r.report.findings.map((f) => [f.bucket, f.id]))}`);
    assert.match(r.stdout, /vs \S+: LCP .+ fixed · 0 new · 0 cover-ups/);
  });

  test('emptied: faster only because the hero, the data and the chart are gone: a cover-up, exit 1', () => {
    const r = runs.emptied;
    const b = r.report.baseline;
    assert.equal(b.runId, runs.fixed.report.runId);
    assert.equal(b.coverUps.length, 1);
    const c = b.coverUps[0];
    assert.equal(c.route, '/');
    assert.ok(c.reasons.some((x) => /the LCP element was an image \(`img\.hero`/.test(x)), JSON.stringify(c.reasons));
    assert.ok(c.reasons.some((x) => /visible text dropped/.test(x)), JSON.stringify(c.reasons));
    assert.equal(r.code, 1);
    assert.match(r.stdout, /COVER-UP \/: faster, or just emptier\?/);
    assert.match(r.md, /> \*\*Faster, or just emptier\?\*\* `\/`/);
  });
});
