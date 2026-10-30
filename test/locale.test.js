/**
 * --locale-strategy, end to end. lingo-app ignores the browser language and picks German only from
 * a /de/ path prefix, ?lang=de, a `lang` cookie or localStorage `lingo-lang`; its German call to
 * action is cut off on a phone. Each strategy must reach the German page and find that bug.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { runCli } from './helpers/cli.js';
import { FIXTURES, startStaticServer } from './helpers/static-server.js';

const MATRIX = ['--routes', '/', '--viewports', 'mobile', '--schemes', 'light', '--locales', 'en,de', '--baseline', 'none'];

describe('--locale-strategy (end-to-end)', { concurrency: false }, () => {
  let tmp;
  let server;
  const out = () => path.join(tmp, 'out');
  const latest = () => JSON.parse(readFileSync(path.join(out(), 'latest', 'report.json'), 'utf8'));
  const look = (extra = []) => runCli(['look', `${server.url}/`, ...MATRIX, '--out', out(), ...extra]);
  const germanCell = (report) => report.cells.find((c) => c.locale === 'de');
  const clippedInGerman = (report) => report.issues.filter((i) => i.type === 'clipped-text' && i.cells.some((c) => c.endsWith('/de')));

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-locale-'));
    server = await startStaticServer(path.join(FIXTURES, 'lingo-app'));
  });

  after(async () => {
    await server?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  test('the browser language alone does not switch this app: German is not localized', { timeout: 120000 }, async () => {
    const res = await look();
    const report = latest();
    assert.equal(res.code, 0, res.stderr);
    assert.equal(germanCell(report).status, 'not-localized');
    assert.equal(report.matrix.localeStrategy, 'browser');
    assert.ok(report.notes.some((n) => n.includes('--locale-strategy')), report.notes.join('\n'));
  });

  for (const strategy of ['query:lang', 'cookie:lang', 'storage:lingo-lang', 'path:/{locale}']) {
    test(`${strategy} reaches the German page and finds the cut-off button`, { timeout: 120000 }, async () => {
      const res = await look(['--locale-strategy', strategy]);
      const report = latest();
      assert.equal(res.code, 1, res.stderr);
      assert.equal(germanCell(report).status, 'ok');
      assert.equal(clippedInGerman(report).length, 1, JSON.stringify(report.issues, null, 2));
      assert.ok(!report.issues.some((i) => i.cells.some((c) => c.endsWith('/en'))), 'English fits');
      assert.equal(report.matrix.localeStrategy, strategy);
      if (strategy.startsWith('path')) assert.match(germanCell(report).url, /\/de\/$/);
      if (strategy.startsWith('query')) assert.match(germanCell(report).url, /\?lang=de$/);
    });
  }
});
