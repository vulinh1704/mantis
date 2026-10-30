/**
 * The pseudo-locale, end to end. pseudo-app is English only and fits; in the pseudo-locale its
 * fixed-width button and a status chip filled in after load must come out cut, while the brand
 * name marked translate="no" stays as it is.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { runCli } from './helpers/cli.js';
import { FIXTURES, startStaticServer } from './helpers/static-server.js';

describe('pseudo-locale (end-to-end)', { concurrency: false }, () => {
  let tmp;
  let server;
  let report;

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-pseudo-'));
    server = await startStaticServer(path.join(FIXTURES, 'pseudo-app'));
    const out = path.join(tmp, 'out');
    const res = await runCli(['look', `${server.url}/`, '--viewports', 'mobile', '--schemes', 'light', '--locales', 'en,pseudo', '--out', out]);
    assert.equal(res.code, 1, res.stderr);
    report = JSON.parse(readFileSync(path.join(out, 'latest', 'report.json'), 'utf8'));
  });

  after(async () => {
    await server?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  const clipped = (locale) => report.issues.filter((i) => i.type === 'clipped-text' && i.cells.some((c) => c.endsWith(`/${locale}`)));

  test('English fits', () => {
    assert.deepEqual(clipped('en'), []);
  });

  test('the pseudo-locale cell is checked, not skipped as "not localized"', () => {
    const cell = report.cells.find((c) => c.locale === 'pseudo');
    assert.equal(cell.status, 'ok');
    assert.equal(cell.url, `${server.url}/`, 'it loads the base language page');
  });

  test('longer text cuts the button and the chip rendered after load', () => {
    const selectors = clipped('pseudo').map((i) => i.selector).join(' ');
    assert.match(selectors, /#subscribe/);
    assert.match(selectors, /#status/);
  });

  test('translate="no" text is left alone', () => {
    assert.ok(!clipped('pseudo').some((i) => /brand/.test(i.selector)), JSON.stringify(clipped('pseudo'), null, 2));
  });

  test('the reported text is the pseudo-localized string', () => {
    const btn = clipped('pseudo').find((i) => /#subscribe/.test(i.selector));
    assert.match(JSON.stringify(btn), /\[Šûû?ƀƀ?šš?çç?ŕŕ?îî?ƀƀ?éé?\]/);
  });
});
