/**
 * Honest fixes vs cover-ups, end to end. A run of buggy-app is the baseline; then the same URL
 * serves the app with a "fix" that only hides a symptom (CSS injected the way an agent would edit
 * the dev server). Each trick must leave the issue reported or turn it into a cover-up error. The
 * honest fix, clean-app behind the same URL, must come out with every issue fixed and no cover-up
 * or lost control.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { runCli } from './helpers/cli.js';
import { FIXTURES, startStaticServer } from './helpers/static-server.js';

const MATRIX = ['--routes', '/', '--viewports', 'mobile,desktop', '--schemes', 'light', '--locales', 'en,vi'];

describe('honest fix vs cover-up (end-to-end)', { concurrency: false }, () => {
  let tmp;
  let server;
  let baseRun;
  const out = () => path.join(tmp, 'out');
  const latest = () => JSON.parse(readFileSync(path.join(out(), 'latest', 'report.json'), 'utf8'));
  const look = (extra = []) => runCli(['look', `${server.url}/`, ...MATRIX, '--out', out(), ...extra]);
  const issues = (report, type, selector) => report.issues.filter((i) => i.type === type && (!selector || i.selector === selector));
  const listed = (report) => report.issues.map((i) => `#${i.id} ${i.severity} ${i.type} ${i.selector} [${i.cells.join(', ')}]: ${i.message}`).join('\n');

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-honest-'));
    server = await startStaticServer(path.join(FIXTURES, 'buggy-app'));
    const res = await look();
    assert.equal(res.code, 1, res.stderr);
    baseRun = latest();
    assert.equal(baseRun.baseline, null, 'the first run has nothing to compare with');
  });

  after(async () => {
    await server?.close();
    if (process.env.MANTIS_KEEP_TEST_OUTPUT) process.stdout.write(`# test output kept in ${tmp}\n`);
    else await rm(tmp, { recursive: true, force: true });
  });

  test('overflow-x: hidden on html and body does not make the 600px promo banner go away', { timeout: 120000 }, async () => {
    server.setInject('html, body { overflow-x: hidden }');
    const res = await look();
    const report = latest();
    assert.equal(report.baseline.runId, baseRun.runId, 'auto baseline is the previous run of the same URL');
    const promo = issues(report, 'page-overflow', '#promo-banner');
    assert.equal(promo.length, 1, listed(report));
    assert.deepEqual(promo[0].cells, ['mobile/light/en', 'mobile/light/vi']);
    assert.equal(promo[0].evidence.maskedBy, 'html');
    assert.match(promo[0].message, /overflow-x: hidden/);
    assert.ok(!report.baseline.fixed.some((f) => f.type === 'page-overflow'), 'the masked overflow does not count as fixed');
    assert.equal(res.code, 1);
  });

  test('hiding the menu toggle on phones turns the overlap into a cover-up', { timeout: 120000 }, async () => {
    server.setInject('@media (max-width: 639px) { #menu-toggle { display: none } }');
    await look(['--baseline', path.join(out(), 'runs', baseRun.runId)]);
    const report = latest();
    assert.equal(issues(report, 'overlap', '#menu-toggle').length, 0, 'the overlap itself is gone');
    const cover = issues(report, 'cover-up', '#menu-toggle');
    assert.equal(cover.length, 1, listed(report));
    assert.equal(cover[0].severity, 'error');
    assert.equal(cover[0].evidence.kind, 'hidden');
    assert.equal(cover[0].evidence.was.type, 'overlap');
    assert.deepEqual(cover[0].cells, ['mobile/light/en', 'mobile/light/vi']);
    assert.equal(report.baseline.coverUps, 1);
    assert.deepEqual(report.baseline.fixed, [], 'a covered-up issue does not count as fixed');
    assert.equal(report.baseline.lost, 0, 'the hidden toggle is reported once, as the cover-up');
  });

  test('hiding the button it overlapped instead is a cover-up too', { timeout: 120000 }, async () => {
    server.setInject('@media (max-width: 639px) { #header-cta { visibility: hidden } }');
    await look(['--baseline', path.join(out(), 'runs', baseRun.runId)]);
    const report = latest();
    const cover = issues(report, 'cover-up', '#header-cta');
    assert.equal(cover.length, 1, listed(report));
    assert.equal(cover[0].evidence.kind, 'hidden');
    assert.equal(cover[0].evidence.was.selector, '#menu-toggle');
  });

  test('shrinking the Vietnamese subscribe label until it fits is a cover-up', { timeout: 120000 }, async () => {
    server.setInject('#newsletter-submit { font-size: 7px }');
    await look(['--baseline', path.join(out(), 'runs', baseRun.runId)]);
    const report = latest();
    assert.equal(issues(report, 'clipped-text', '#newsletter-submit').length, 0, `the label fits now\n${listed(report)}`);
    const cover = issues(report, 'cover-up', '#newsletter-submit');
    assert.equal(cover.length, 1, listed(report));
    assert.equal(cover[0].evidence.kind, 'shrunk');
    assert.deepEqual(cover[0].cells, ['mobile/light/vi', 'desktop/light/vi']);
  });

  test('the honest fix (clean-app behind the same URL) fixes everything, with no cover-up and nothing lost', { timeout: 120000 }, async () => {
    server.setInject('');
    server.setRoot(path.join(FIXTURES, 'clean-app'));
    const res = await look(['--baseline', path.join(out(), 'runs', baseRun.runId)]);
    const report = latest();
    assert.equal(listed(report), '', 'no issue at all');
    assert.equal(res.code, 0, res.stderr);
    assert.equal(report.baseline.coverUps, 0);
    assert.equal(report.baseline.lost, 0);
    assert.deepEqual(report.baseline.new, []);
    assert.equal(report.baseline.fixed.length, baseRun.issues.length);
    const md = readFileSync(path.join(out(), 'latest', 'report.md'), 'utf8');
    assert.match(md, new RegExp(`## Compared with run ${baseRun.runId}`));
    assert.match(md, new RegExp(`\\*\\*${baseRun.issues.length} fixed · 0 new · 0 cover-ups · 0 lost\\*\\*`));
    assert.match(res.stdout, new RegExp(`vs ${baseRun.runId}: ${baseRun.issues.length} fixed · 0 new · 0 cover-ups · 0 lost`));
  });
});
