/**
 * Right-to-left pages, end to end. rtl-app is a pricing page in English and Arabic (?lang=ar)
 * whose plan cards don't fit a phone. `/` sets dir="rtl" for Arabic; `/broken` forgets to;
 * `/wrapped` sets it on the app's root element instead of <html>, which is fine.
 * - page-overflow must name the culprit on the right-to-left page too, where it sticks out on the
 *   left (before, only a vague "the page scrolls" issue came out);
 * - direction must flag Arabic laid out left to right, and nothing else;
 * - pseudo-rtl must lay an English-only page out right to left;
 * - markers must be drawn where the culprit is, left of x = 0.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright';
import { annotate } from '../src/annotate.js';
import { runCli } from './helpers/cli.js';
import { FIXTURES, startStaticServer } from './helpers/static-server.js';

const ONE_CELL = ['--viewports', 'mobile', '--schemes', 'light', '--baseline', 'none'];

describe('right-to-left pages (end-to-end)', { concurrency: false }, () => {
  let tmp;
  let server;
  let report;
  let pseudo;
  const issues = (type, route, locale) => report.issues.filter((i) => i.type === type && i.route === route && i.cells.some((c) => c.endsWith(`/${locale}`)));
  // The same culprit in two languages is one issue; each cell keeps its own evidence and message.
  const occurrence = (issue, locale) => {
    const o = issue.occurrences.find((x) => x.cell.endsWith(`/${locale}`));
    return { evidence: o.evidence, message: o.message ?? issue.message };
  };

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-rtl-'));
    server = await startStaticServer(path.join(FIXTURES, 'rtl-app'));
    const out = path.join(tmp, 'out');
    let res = await runCli(['look', `${server.url}/`, '--routes', '/,/broken,/wrapped', '--locales', 'en,ar', '--locale-strategy', 'query:lang', ...ONE_CELL, '--out', out]);
    assert.equal(res.code, 1, res.stderr);
    report = JSON.parse(readFileSync(path.join(out, 'latest', 'report.json'), 'utf8'));
    const out2 = path.join(tmp, 'out2');
    res = await runCli(['look', `${server.url}/`, '--locales', 'en,pseudo-rtl', ...ONE_CELL, '--out', out2]);
    assert.equal(res.code, 1, res.stderr);
    pseudo = JSON.parse(readFileSync(path.join(out2, 'latest', 'report.json'), 'utf8'));
  });

  after(async () => {
    await server?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  test('English: the plan row overflows past the right edge', () => {
    const [o] = issues('page-overflow', '/', 'en');
    assert.ok(o, JSON.stringify(report.issues, null, 2));
    assert.match(o.selector, /plans/);
    assert.equal(occurrence(o, 'en').evidence.edge, undefined);
    assert.match(occurrence(o, 'en').message, /right edge/);
  });

  test('Arabic (dir="rtl"): the same row is named, sticking out past the left edge', () => {
    const [o] = issues('page-overflow', '/', 'ar');
    assert.ok(o, JSON.stringify(report.issues, null, 2));
    assert.match(o.selector, /plans/, 'a culprit, not the vague whole-page issue');
    const ar = occurrence(o, 'ar');
    assert.equal(ar.evidence.edge, 'left');
    assert.ok(ar.evidence.overflowBy > 50, `overflowBy ${ar.evidence.overflowBy}`);
    assert.match(ar.message, /left edge/);
  });

  test('direction flags Arabic laid out left to right, only there', () => {
    assert.equal(issues('direction', '/broken', 'ar').length, 1);
    assert.match(issues('direction', '/broken', 'ar')[0].message, /dir="rtl"/);
    assert.deepEqual(issues('direction', '/', 'ar'), []);
    assert.ok(!report.issues.some((i) => i.type === 'direction' && i.cells.some((c) => c.endsWith('/en'))));
  });

  test('pseudo-rtl lays an English page out right to left', () => {
    const cell = pseudo.cells.find((c) => c.locale === 'pseudo-rtl');
    assert.equal(cell.status, 'ok');
    const o = pseudo.issues.find((i) => i.type === 'page-overflow' && i.cells.some((c) => c.endsWith('/pseudo-rtl')));
    assert.ok(o, JSON.stringify(pseudo.issues, null, 2));
    assert.equal(o.occurrences.find((x) => x.cell.endsWith('/pseudo-rtl')).evidence.edge, 'left');
    assert.ok(!pseudo.issues.some((i) => i.type === 'direction'), 'pseudo-locales set the direction themselves');
  });

  test('dir="rtl" on the app root instead of <html> is fine', () => {
    assert.deepEqual(issues('direction', '/wrapped', 'ar'), [], JSON.stringify(report.issues, null, 2));
  });

  test('a pseudo-locale over a non-Latin page is checked, not "not localized"', async () => {
    const out = path.join(tmp, 'out3');
    await runCli(['look', `${server.url}/`, '--locales', 'ar,pseudo-rtl', '--locale-strategy', 'query:lang', ...ONE_CELL, '--out', out]);
    const r = JSON.parse(readFileSync(path.join(out, 'latest', 'report.json'), 'utf8'));
    assert.equal(r.cells.find((c) => c.locale === 'pseudo-rtl').status, 'ok');
    assert.ok(!r.notes.some((n) => /not localized/.test(n)), r.notes.join('\n'));
  });

  test('markers on a right-to-left page are drawn where the culprit is, left of x = 0', async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 360, height: 640 } });
      await page.goto(`${server.url}/?lang=ar`, { waitUntil: 'load' });
      const target = await page.evaluate(() => {
        const r = document.querySelector('#plans .plan:last-child').getBoundingClientRect();
        return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
      });
      assert.ok(target.x < 0, `the last card sticks out on the left (x ${target.x})`);
      await annotate(page, [{ n: 1, severity: 'error', rect: target }]);
      const box = await page.evaluate(() => {
        const r = document.querySelector('[data-mantis-overlay-root] div').getBoundingClientRect();
        return { x: r.left + scrollX, width: r.width };
      });
      assert.ok(Math.abs(box.x - target.x) <= 1, `marker at ${box.x}, culprit at ${target.x}`);
    } finally {
      await browser.close();
    }
  });
});
