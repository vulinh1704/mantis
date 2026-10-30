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
import { chromium } from 'playwright';
import { installPseudoLocale } from '../src/page.js';
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

  test('what the pseudo-locale leaves alone, and what it still rewrites', async () => {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      await installPseudoLocale(context);
      const page = await context.newPage();
      await page.goto(`${server.url}/ssr`, { waitUntil: 'load' });
      const got = await page.evaluate(() => ({
        svgStyle: document.querySelector('#logo style').textContent,
        svgFill: getComputedStyle(document.querySelector('#logo rect')).fill,
        icon: document.getElementById('icon').textContent,
        brand: document.querySelector('[translate="no"]').firstChild.data,
        tagline: document.getElementById('tagline').textContent,
        greeting: document.getElementById('greeting').textContent,
      }));
      assert.equal(got.svgStyle, '.mark { fill: rgb(29, 78, 216); }', 'CSS inside an SVG <style> is not prose');
      assert.equal(got.svgFill, 'rgb(29, 78, 216)');
      assert.equal(got.icon, 'menu', 'icon-font ligatures stay as they are');
      assert.equal(got.brand, 'Signal ', 'translate="no"');
      assert.match(got.tagline, /^\[/, 'translate="yes" inside translate="no" is rewritten');
      assert.match(got.greeting, /^\[ŴŴ?éé?ļļ?çç?öö?ɱɱ?éé? ƀƀ?áá?çç?ķķ?\]$/);
    } finally {
      await browser.close();
    }
  });

  test('a hydration mismatch the pseudo-locale causes is a note, not a console error', async () => {
    const out = path.join(tmp, 'out-ssr');
    await runCli(['look', `${server.url}/ssr`, '--viewports', 'mobile', '--schemes', 'light', '--locales', 'en,pseudo', '--out', out]);
    const r = JSON.parse(readFileSync(path.join(out, 'latest', 'report.json'), 'utf8'));
    assert.ok(!r.issues.some((i) => i.type === 'console'), JSON.stringify(r.issues, null, 2));
    const cell = r.cells.find((c) => c.locale === 'pseudo');
    assert.ok((cell.notes ?? []).some((n) => /hydration mismatch/.test(n)), JSON.stringify(cell, null, 2));
  });

  test('non-Latin text grows too', async () => {
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      await installPseudoLocale(context);
      const page = await context.newPage();
      await page.goto(`data:text/html,${encodeURIComponent('<p id="t">مرحبا بكم</p><p id="j">設定</p>')}`);
      const t = await page.evaluate(() => [document.getElementById('t').textContent, document.getElementById('j').textContent]);
      assert.match(t[0], /^\[.{10,}\]$/u, t[0]);
      assert.ok([...t[1]].length > 4, t[1]);
    } finally {
      await browser.close();
    }
  });
});
