/**
 * --storage-state, end to end. gated-app shows a sign-in form unless localStorage holds a session;
 * its planted bug (an invoice table wider than a phone) is only behind the sign-in.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { runCli } from './helpers/cli.js';
import { FIXTURES, startStaticServer } from './helpers/static-server.js';

const MATRIX = ['--routes', '/', '--viewports', 'mobile', '--schemes', 'light'];

describe('--storage-state (end-to-end)', { concurrency: false }, () => {
  let tmp;
  let server;
  let session;
  const out = () => path.join(tmp, 'out');
  const latestDir = () => path.join(out(), 'latest');
  const latest = () => JSON.parse(readFileSync(path.join(latestDir(), 'report.json'), 'utf8'));
  const look = (extra = []) => runCli(['look', `${server.url}/`, ...MATRIX, '--out', out(), ...extra]);
  const overflow = (report) => report.issues.filter((i) => i.type === 'page-overflow');

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-session-'));
    server = await startStaticServer(path.join(FIXTURES, 'gated-app'));
    session = path.join(tmp, 'ledger-session.json');
    await writeFile(session, JSON.stringify({
      cookies: [],
      origins: [{ origin: server.url, localStorage: [{ name: 'ledger-session', value: 'signed-in' }] }],
    }));
  });

  after(async () => {
    await server?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  test('without a session only the sign-in page is seen', { timeout: 120000 }, async () => {
    const res = await look();
    const report = latest();
    assert.equal(res.code, 0, report.issues.map((i) => `${i.type} ${i.selector}: ${i.message}`).join('\n'));
    assert.equal(overflow(report).length, 0);
    assert.equal(report.matrix.storageState, null);
  });

  test('with a session the page behind the sign-in is checked', { timeout: 120000 }, async () => {
    const res = await look(['--storage-state', session]);
    const report = latest();
    assert.equal(res.code, 1, res.stderr);
    const found = overflow(report);
    assert.equal(found.length, 1, JSON.stringify(report.issues, null, 2));
    assert.match(found[0].selector, /invoices/);
    assert.equal(report.matrix.storageState, 'ledger-session.json');
    assert.equal(report.baseline, null, 'a signed-out run is not the baseline of a signed-in one');
    assert.match(readFileSync(path.join(latestDir(), 'report.md'), 'utf8'), /session `ledger-session\.json`/);
  });

  test('the next signed-in run compares with the previous signed-in run', { timeout: 120000 }, async () => {
    const first = latest().runId;
    await look(['--storage-state', session]);
    const report = latest();
    assert.equal(report.baseline?.runId, first);
    assert.equal(report.baseline.coverUps, 0);
  });

  test('a missing or malformed storage state file is a usage error', { timeout: 60000 }, async () => {
    const missing = await look(['--storage-state', path.join(tmp, 'nope.json')]);
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /--storage-state: cannot read .*no such file/);
    const bad = path.join(tmp, 'bad.json');
    await writeFile(bad, JSON.stringify({ token: 'x' }));
    const malformed = await look(['--storage-state', bad]);
    assert.equal(malformed.code, 2);
    assert.match(malformed.stderr, /not a Playwright storage state/);
  });
});
