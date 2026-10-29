/**
 * End-to-end: run the real CLI against the fixture sites.
 * - buggy-app: every bug in PLANTED.json must be reported with the right type, selector and
 *   exactly the right cells (recall), and nothing else may be reported (precision);
 * - clean-app: the same site with every bug fixed must produce zero issues.
 * Set MANTIS_KEEP_TEST_OUTPUT=1 to keep the generated reports and screenshots.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { hasFfmpeg } from '../src/proof.js';
import { runCli } from './helpers/cli.js';
import { evaluate, formatScore } from './helpers/planted.js';
import { FIXTURES, startStaticServer } from './helpers/static-server.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngSize(file) {
  const b = readFileSync(file);
  assert.ok(b.subarray(0, 8).equals(PNG_MAGIC), `${file} is not a PNG`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

describe('fixtures (end-to-end)', { concurrency: false }, () => {
  let tmp;
  let buggy;
  let clean;
  const runs = {};

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-test-'));
    buggy = await startStaticServer(path.join(FIXTURES, 'buggy-app'));
    clean = await startStaticServer(path.join(FIXTURES, 'clean-app'));
  });

  after(async () => {
    await buggy?.close();
    await clean?.close();
    if (process.env.MANTIS_KEEP_TEST_OUTPUT) process.stdout.write(`# test output kept in ${tmp}\n`);
    else await rm(tmp, { recursive: true, force: true });
  });

  test('buggy-app: every planted bug is reported in exactly the right cells, and nothing else', { timeout: 300000 }, async (t) => {
    const out = path.join(tmp, 'buggy');
    const res = await runCli(['look', buggy.url, '--routes', '/,/settings', '--locales', 'en,vi', '--out', out]);
    assert.equal(res.code, 1, `exit code should be 1 (errors found)\n${res.stderr}`);
    const report = JSON.parse(await readFile(path.join(out, 'latest', 'report.json'), 'utf8'));
    const planted = JSON.parse(await readFile(path.join(FIXTURES, 'buggy-app', 'PLANTED.json'), 'utf8'));
    const score = evaluate(report, planted);
    t.diagnostic(`\n${formatScore(score)}`);
    const failed = score.expectations.filter((e) => !e.ok).map((e) => `${e.id} (${e.type}): ${e.reason}`);
    assert.deepEqual(failed, [], 'planted bugs not detected exactly');
    const unexpected = score.unexpected.map((i) => `#${i.id} ${i.severity} ${i.type} ${i.route} ${i.selector} [${i.cells.join(', ')}]: ${i.message}`);
    assert.deepEqual(unexpected, [], 'unexpected issues (false positives)');
    assert.equal(report.summary.failedCells, 0);
    runs.buggy = { out, report };
  });

  test('clean-app: zero issues, and the untranslated /legal page is marked not localized', { timeout: 300000 }, async () => {
    const out = path.join(tmp, 'clean');
    const res = await runCli(['look', clean.url, '--routes', '/,/settings,/legal', '--locales', 'en,vi', '--out', out]);
    const report = JSON.parse(await readFile(path.join(out, 'latest', 'report.json'), 'utf8'));
    const listed = report.issues.map((i) => `#${i.id} ${i.severity} ${i.type} ${i.route} ${i.selector} [${i.cells.join(', ')}]: ${i.message}`);
    assert.deepEqual(listed, [], 'the clean app must not produce any issue');
    assert.equal(res.code, 0, res.stderr);
    const legalVi = report.cells.filter((c) => c.route === '/legal' && c.locale === 'vi');
    assert.equal(legalVi.length, 6);
    assert.ok(legalVi.every((c) => c.status === 'not-localized'));
    assert.ok(report.cells.filter((c) => !(c.route === '/legal' && c.locale === 'vi')).every((c) => c.status === 'ok'));
    assert.ok(report.notes.some((n) => /`\/legal` · vi: not localized/.test(n)));
    runs.clean = { out, report };
  });

  test('look writes report.json, report.md, annotated shots and a contact sheet, copied to latest/', () => {
    assert.ok(runs.buggy, 'needs the buggy-app run');
    const { out, report } = runs.buggy;
    const runDir = path.join(out, 'runs', report.runId);
    const latest = path.join(out, 'latest');
    for (const dir of [runDir, latest]) {
      for (const f of ['report.json', 'report.md', 'contact-sheet.png']) assert.ok(existsSync(path.join(dir, f)), `${dir}/${f}`);
    }
    assert.equal(readFileSync(path.join(latest, 'report.md'), 'utf8'), readFileSync(path.join(runDir, 'report.md'), 'utf8'));
    assert.equal(report.cells.length, 24);
    for (const c of report.cells) {
      assert.match(c.screenshot, /^shots\/(home|settings)__(mobile|tablet|desktop)__(light|dark)__(en|vi)\.png$/);
      const size = pngSize(path.join(runDir, c.screenshot));
      assert.ok(size.width >= c.width, `${c.screenshot} is narrower than the viewport`);
    }
    const sheet = pngSize(path.join(runDir, 'contact-sheet.png'));
    assert.ok(sheet.width > 1200 && sheet.height > 800, `contact sheet is ${sheet.width}x${sheet.height}`);
    const md = readFileSync(path.join(runDir, 'report.md'), 'utf8');
    assert.match(md, /^# Mantis report/);
    assert.match(md, /\| route · locale \| mobile light \| mobile dark \| tablet light \| tablet dark \| desktop light \| desktop dark \|/);
    assert.match(md, /### page-overflow \(1 error\)/);
    assert.ok(md.length < 20000, `report.md should stay compact (${md.length} chars)`);
    for (const issue of report.issues) {
      if (issue.rect) assert.ok(issue.screenshot && existsSync(path.join(runDir, issue.screenshot)), `#${issue.id} has a screenshot`);
    }
  });

  test('issue numbers do not depend on concurrency', { timeout: 300000 }, async () => {
    const args = ['look', buggy.url, '--routes', '/,/settings', '--viewports', 'mobile,desktop', '--locales', 'en,vi'];
    const a = await runCli([...args, '--concurrency', '1', '--out', path.join(tmp, 'seq')]);
    const b = await runCli([...args, '--concurrency', '6', '--out', path.join(tmp, 'par')]);
    assert.equal(a.code, 1);
    assert.equal(b.code, 1);
    const load = (dir) => JSON.parse(readFileSync(path.join(tmp, dir, 'latest', 'report.json'), 'utf8')).issues.map((i) => `${i.id} ${i.type} ${i.route} ${i.selector} ${i.cells.join(',')}`);
    assert.deepEqual(load('par'), load('seq'));
  });

  test('--json prints the report on stdout', { timeout: 120000 }, async () => {
    const res = await runCli(['look', clean.url, '--routes', '/legal', '--viewports', 'mobile', '--schemes', 'light', '--json', '--out', path.join(tmp, 'json')]);
    assert.equal(res.code, 0, res.stderr);
    const report = JSON.parse(res.stdout);
    assert.equal(report.tool, 'mantis');
    assert.equal(report.cells.length, 1);
  });

  test('proof renders a before/after sheet from two runs', { timeout: 120000 }, async () => {
    assert.ok(runs.buggy && runs.clean, 'needs both fixture runs');
    const file = path.join(tmp, 'proof', 'proof.png');
    const before = path.join(runs.buggy.out, 'runs', runs.buggy.report.runId);
    const res = await runCli(['proof', '--before', before, '--after', path.join(runs.clean.out, 'latest'), '--out', file]);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, new RegExp(`errors ${runs.buggy.report.summary.errors} -> 0, warnings ${runs.buggy.report.summary.warnings} -> 0`));
    const size = pngSize(file);
    assert.ok(size.width > 900 && size.height > 600, `proof is ${size.width}x${size.height}`);
    const zoom = file.replace(/\.png$/, '-zoom.png');
    assert.match(res.stdout, /zoom {4}.*proof-zoom\.png/);
    const zoomSize = pngSize(zoom);
    assert.ok(zoomSize.width > 1000 && zoomSize.height > 500, `close-up is ${zoomSize.width}x${zoomSize.height}`);
  });

  test('proof --video stacks BEFORE/AFTER recordings into one MP4, between title and closing cards', { timeout: 180000 }, async (t) => {
    if (!(await hasFfmpeg())) {
      t.skip('ffmpeg is not installed');
      return;
    }
    assert.ok(runs.buggy && runs.clean, 'needs both fixture runs');
    const file = path.join(tmp, 'video', 'proof.png');
    const before = path.join(runs.buggy.out, 'runs', runs.buggy.report.runId);
    const res = await runCli(['proof', '--before', before, '--after', path.join(runs.clean.out, 'latest'), '--video', '--before-url', `${buggy.url}/`, '--after-url', `${clean.url}/`, '--out', file]);
    assert.equal(res.code, 0, res.stderr);
    const mp4 = file.replace(/\.png$/, '.mp4');
    assert.ok(existsSync(mp4), 'mp4 written');
    assert.ok(statSync(mp4).size > 20000, 'mp4 has content');
    assert.equal(readFileSync(mp4).subarray(4, 8).toString('latin1'), 'ftyp');
    assert.deepEqual(readdirSync(path.dirname(file)).filter((f) => f.endsWith('.webm')), [], 'no leftover webm files');
  });

  test('exit code 2 for an unreachable URL and for bad usage', { timeout: 60000 }, async () => {
    const dead = await startStaticServer(path.join(FIXTURES, 'clean-app'));
    const url = dead.url;
    await dead.close();
    const res = await runCli(['look', url, '--out', path.join(tmp, 'dead')]);
    assert.equal(res.code, 2);
    assert.match(res.stderr, /cannot reach/);
    assert.equal(existsSync(path.join(tmp, 'dead')), false, 'nothing is written for an unreachable URL');
    const usage = await runCli(['look', clean.url, '--viewports', 'phablet']);
    assert.equal(usage.code, 2);
    assert.match(usage.stderr, /unknown viewport "phablet"/);
    assert.equal((await runCli(['frobnicate'])).code, 2);
    const help = await runCli(['--help']);
    assert.equal(help.code, 0);
    assert.match(help.stdout, /mantis look <url>/);
  });
});
