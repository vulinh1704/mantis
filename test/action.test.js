/**
 * The GitHub Action's scripts (action/run.mjs, action/comment.mjs). The pieces are unit-tested;
 * run.mjs also runs end to end the way the action runs it: INPUT_* variables, GITHUB_OUTPUT and
 * GITHUB_STEP_SUMMARY files, and `mantis` on the PATH (a shim to this checkout's CLI).
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { commentBody, marker, pullRequestOf } from '../action/comment.mjs';
import { lookSummary, mantisArgs, perfSummary } from '../action/run.mjs';
import { BIN, ROOT } from './helpers/cli.js';
import { FIXTURES, startStaticServer } from './helpers/static-server.js';

describe('action: pieces', () => {
  test('inputs become mantis arguments, per command', () => {
    const inputs = { routes: '/, /settings', viewports: 'mobile,desktop', schemes: 'light', locales: '', runs: '3', profile: 'desktop', args: '--ignore ".ad, .promo" --timeout 45000' };
    assert.deepEqual(mantisArgs('look', 'http://x/', inputs, '/o', 'none'), [
      'look', 'http://x/', '--out', '/o', '--baseline', 'none', '--routes', '/,/settings', '--viewports', 'mobile,desktop', '--schemes', 'light', '--ignore', '.ad, .promo', '--timeout', '45000',
    ]);
    assert.deepEqual(mantisArgs('perf', 'http://x/', inputs, '/o', '/o/baseline/perf/latest'), [
      'perf', 'http://x/', '--out', '/o', '--baseline', '/o/baseline/perf/latest', '--routes', '/,/settings', '--runs', '3', '--profile', 'desktop', '--ignore', '.ad, .promo', '--timeout', '45000',
    ]);
  });

  test('the look summary: counts, the comparison and the issues', () => {
    const report = {
      summary: { errors: 2, warnings: 1, cells: 3 },
      baseline: { fixed: [{}], new: [{}, {}], coverUps: 1, lost: 0 },
      issues: [
        { severity: 'warning', type: 'tap-target', selector: 'a.x', cells: ['mobile/light/en'], message: 'small' },
        { severity: 'error', type: 'page-overflow', selector: '.row|wide', cells: ['mobile/light/en', 'mobile/dark/en', 'tablet/light/en', 'tablet/dark/en'], message: 'sticks out by 120px' },
      ],
    };
    const md = lookSummary(report, { url: 'https://pr-1.example.com/', baselineUrl: 'https://example.com/' });
    assert.match(md, /^### 🔴 Mantis look: 2 errors, 1 warning in 3 cells/);
    assert.match(md, /compared with `https:\/\/example\.com\/`/);
    assert.match(md, /\*\*1 fixed · 2 new · 1 cover-up · 0 lost\*\*: an issue went away because its element was hidden/);
    assert.ok(md.indexOf('page-overflow') < md.indexOf('tap-target'), 'errors first');
    assert.match(md, /`\.row\\\|wide`/, 'pipes in selectors are escaped');
    assert.match(md, /mobile\/light\/en, mobile\/dark\/en, tablet\/light\/en \+1/);
  });

  test('the perf summary: metrics, receipt, cover-ups and the first fixes', () => {
    const report = {
      summary: { 'do-first': 1, plan: 1, nice: 2, 'your-call': 0 },
      profile: { label: 'mobile (4× slower CPU, slow 4G)' },
      runs: 3,
      baseline: { receipt: 'LCP 4.8 s → 1.9 s · 2 fixed · 0 new · 1 cover-up', coverUps: [{ route: '/', improved: ['LCP 4.8 s → 1.9 s'], reasons: ['the LCP element was an image and is now h1 text'] }] },
      routes: [{ route: '/', metrics: { lcp: { median: 1900, rating: 'good' }, fcp: { median: 900, rating: 'good' }, tbt: { median: 650, rating: 'poor' }, cls: { median: 0.02, rating: 'good' }, bytes: { median: 300 * 1024 } } }],
      findings: [
        { bucket: 'do-first', title: 'hero.png is 3× wider than it is drawn', metric: 'lcp', savings: { ms: 1200 }, fixRisk: 'low' },
        { bucket: 'plan', title: 'unused code', metric: 'bytes', savings: { kb: 400 }, fixRisk: 'medium' },
        { bucket: 'nice', title: 'small', metric: 'tbt', savings: { ms: 10 }, fixRisk: 'low' },
      ],
    };
    const md = perfSummary(report, { url: 'https://pr-1.example.com/' });
    assert.match(md, /^### 🔴 Mantis perf: 1 to do first, 1 to plan/, 'a cover-up is red');
    assert.match(md, /\*\*LCP 4\.8 s → 1\.9 s · 2 fixed · 0 new · 1 cover-up\*\*/);
    assert.match(md, /> 🔴 \*\*Faster, or just emptier\?\*\* `\/`/);
    assert.match(md, /\| `\/` \| 🟢 1\.9 s \| 🟢 900 ms \| 🔴 650 ms \| 🟢 0\.02 \| 300 KB \|/);
    assert.match(md, /✅ do first · hero\.png is 3× wider than it is drawn \(LCP −1\.2 s, risk low\)/);
    assert.match(md, /🛠 plan · unused code \(−400 KB, risk medium\)/);
    assert.doesNotMatch(md, /small/, 'nice-to-have fixes stay in perf.md');
  });

  test('the comment starts with a marker per command, so a later run updates it', () => {
    const body = commentBody('### 🟢 Mantis look: 0 errors\n', { command: 'look', artifactUrl: 'https://github.com/o/r/actions/runs/1/artifacts/2' });
    assert.ok(body.startsWith(marker('look')));
    assert.notEqual(marker('look'), marker('perf'));
    assert.match(body, /📎 \[Reports, sheets and screenshots\]\(https:\/\/github\.com\/o\/r\/actions\/runs\/1\/artifacts\/2\) · <sub>by/);
    assert.doesNotMatch(commentBody('x', { command: 'perf' }), /📎/);
  });

  test('the pull request: from the event, or the open one holding a deployed commit', async () => {
    const calls = [];
    const api = async (method, url) => {
      calls.push(url);
      return [{ number: 7, state: 'closed' }, { number: 9, state: 'open' }];
    };
    const ctx = { repo: 'o/r', token: 't', sha: 'abc', api };
    assert.equal(await pullRequestOf({ pull_request: { number: 3 } }, ctx), 3);
    assert.equal(await pullRequestOf({ deployment: { sha: 'def' } }, ctx), 9, 'Vercel and Netlify deployments');
    assert.match(calls[0], /\/repos\/o\/r\/commits\/def\/pulls$/);
    assert.equal(await pullRequestOf({}, { ...ctx, sha: '' }), null);
  });
});

describe('action: run.mjs end to end', { concurrency: false }, () => {
  let tmp;
  let buggy;
  let clean;
  let outputs;
  let summary;
  let code;

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-action-'));
    buggy = await startStaticServer(path.join(FIXTURES, 'buggy-app'));
    clean = await startStaticServer(path.join(FIXTURES, 'clean-app'));
    // `mantis` on the PATH, as the action's install step leaves it
    const bin = path.join(tmp, 'bin');
    await mkdir(bin);
    await writeFile(path.join(bin, 'mantis'), `#!/bin/sh\nexec "${process.execPath}" "${BIN}" "$@"\n`);
    await chmod(path.join(bin, 'mantis'), 0o755);
    const env = {
      ...process.env,
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      GITHUB_OUTPUT: path.join(tmp, 'output'),
      GITHUB_STEP_SUMMARY: path.join(tmp, 'summary'),
      INPUT_URL: `${buggy.url}/`,
      INPUT_BASELINE_URL: `${clean.url}/`,
      INPUT_COMMAND: 'look',
      INPUT_VIEWPORTS: 'mobile',
      INPUT_SCHEMES: 'light',
      INPUT_FAIL_ON: 'exit',
      INPUT_OUT: path.join(tmp, 'out'),
    };
    await writeFile(env.GITHUB_OUTPUT, '');
    code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(ROOT, 'action', 'run.mjs')], { cwd: tmp, env, stdio: 'ignore' });
      child.on('close', resolve);
    });
    outputs = Object.fromEntries((await readFile(env.GITHUB_OUTPUT, 'utf8')).trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    summary = await readFile(env.GITHUB_STEP_SUMMARY, 'utf8');
  });

  after(async () => {
    await buggy?.close();
    await clean?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  test('the step itself succeeds; failing is left to the last step', () => {
    assert.equal(code, 0);
    assert.equal(outputs['exit-code'], '1');
    assert.equal(outputs.fail, 'true');
    assert.match(outputs.reason, /^\d+ errors? found$/);
  });

  test('outputs, the job summary and the comment file, compared with the baseline URL', async () => {
    assert.ok(Number(outputs.errors) > 0, JSON.stringify(outputs));
    assert.equal(outputs['out-dir'], path.join(tmp, 'out'));
    assert.match(outputs.report, /latest\/report\.md$/);
    assert.match(summary, /^### 🔴 Mantis look: \d+ errors?/);
    assert.match(summary, new RegExp(`compared with \`${clean.url}/\``));
    assert.match(summary, /\*\*\d+ fixed · \d+ new · \d+ cover-ups? · \d+ lost\*\*/);
    assert.equal(await readFile(outputs['comment-file'], 'utf8'), summary.trim() + '\n');
  });
});
