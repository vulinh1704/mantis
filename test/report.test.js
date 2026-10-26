import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { contrastRatio, isLargeText, luminance, toHex } from '../src/color.js';
import { compareSnapshots } from '../src/detectors/theme-leak.js';
import { parseLookArgs } from '../src/options.js';
import { IssueRegistry, buildReport, compressCells, expandCells, renderMarkdown } from '../src/report.js';
import { evaluate, formatScore } from './helpers/planted.js';

const MATRIX = { viewports: ['mobile', 'tablet', 'desktop'], schemes: ['light', 'dark'], locales: ['en', 'vi'] };

function cell(route, viewport, scheme, locale, extra = {}) {
  const sizes = { mobile: [360, 740], tablet: [768, 1024], desktop: [1440, 900] };
  return {
    id: `${route === '/' ? 'home' : route.slice(1)}__${viewport}__${scheme}__${locale}`,
    key: `${viewport}/${scheme}/${locale}`,
    route,
    viewport,
    width: sizes[viewport][0],
    height: sizes[viewport][1],
    scheme,
    locale,
    status: 'ok',
    screenshot: `shots/x__${viewport}__${scheme}__${locale}.png`,
    notes: [],
    ...extra,
  };
}

function sampleReport() {
  const opts = parseLookArgs(['http://127.0.0.1:4321', '--routes', '/,/settings', '--locales', 'en,vi']);
  const registry = new IssueRegistry();
  const cells = [];
  for (const route of opts.routes) {
    for (const l of MATRIX.locales) for (const v of MATRIX.viewports) for (const s of MATRIX.schemes) cells.push(cell(route, v, s, l));
  }
  const overflow = { type: 'page-overflow', severity: 'error', selector: '#promo', rect: { x: 0, y: 0, width: 600, height: 40 }, message: 'wide', evidence: {} };
  for (const s of MATRIX.schemes) for (const l of MATRIX.locales) registry.add('/', `mobile/${s}/${l}`, overflow, `shots/home__mobile__${s}__${l}.png`);
  const consoleErr = { type: 'console', severity: 'error', selector: null, rect: null, key: 'pageerror:boom', message: 'Uncaught Error: boom', evidence: {} };
  for (const v of MATRIX.viewports) for (const s of MATRIX.schemes) for (const l of MATRIX.locales) registry.add('/settings', `${v}/${s}/${l}`, consoleErr, null);
  const tap = { type: 'tap-target', severity: 'warn', selector: '#icon', rect: { x: 1, y: 2, width: 16, height: 16 }, message: 'small', evidence: {} };
  registry.add('/', 'mobile/light/en', tap, 'shots/a.png');
  const report = buildReport({
    version: '0.1.0',
    runId: 'test-run',
    startedAt: new Date('2026-10-26T08:00:00Z'),
    finishedAt: new Date('2026-10-26T08:00:12Z'),
    options: { ...opts, darkStrategyText: 'media' },
    cells,
    issues: registry.issues,
    notes: ['a note'],
  });
  return { report, registry };
}

describe('IssueRegistry', () => {
  test('merges the same issue across cells, keeps numbering and per-cell occurrences', () => {
    const r = new IssueRegistry();
    const a = r.add('/', 'mobile/light/en', { type: 'contrast', severity: 'error', selector: '#x', rect: { x: 0, y: 0, width: 1, height: 1 }, message: 'ratio 2.1', evidence: { ratio: 2.1 } }, 'shots/a.png');
    const b = r.add('/', 'mobile/dark/en', { type: 'contrast', severity: 'error', selector: '#x', rect: { x: 0, y: 0, width: 1, height: 1 }, message: 'ratio 1.9', evidence: { ratio: 1.9 } }, 'shots/b.png');
    const c = r.add('/', 'mobile/dark/en', { type: 'contrast', severity: 'error', selector: '#y', rect: null, message: 'other', evidence: {} });
    const d = r.add('/about', 'mobile/dark/en', { type: 'contrast', severity: 'error', selector: '#x', rect: null, message: 'ratio 1.9', evidence: {} });
    assert.equal(a, b);
    assert.equal(a.id, 1);
    assert.equal(c.id, 2);
    assert.equal(d.id, 3, 'same selector on another route is another issue');
    assert.deepEqual(a.cells, ['mobile/light/en', 'mobile/dark/en']);
    assert.equal(a.message, 'ratio 2.1');
    assert.equal(a.occurrences[1].message, 'ratio 1.9');
    assert.equal(a.screenshot, 'shots/a.png');
  });

  test('severity escalates to error, `key` separates and `dedupeKey` merges', () => {
    const r = new IssueRegistry();
    const w = r.add('/', 'mobile/light/en', { type: 'clipped-text', severity: 'warn', selector: '#b', key: 'wrap', rect: null, message: 'm' });
    const e = r.add('/', 'mobile/light/en', { type: 'clipped-text', severity: 'error', selector: '#b', key: 'cut', rect: null, message: 'm' });
    assert.notEqual(w, e);
    const x = r.add('/', 'tablet/light/en', { type: 'clipped-text', severity: 'error', selector: '#b', key: 'wrap', rect: null, message: 'm' });
    assert.equal(x, w);
    assert.equal(w.severity, 'error');
    const l1 = r.add('/', 'mobile/light/en', { type: 'layout-shift', severity: 'warn', selector: '#img', dedupeKey: 'cls', rect: null, message: 'cls' });
    const l2 = r.add('/', 'desktop/light/en', { type: 'layout-shift', severity: 'warn', selector: 'p.lead', dedupeKey: 'cls', rect: null, message: 'cls' });
    assert.equal(l1, l2);
  });
});

describe('cells', () => {
  test('compressCells finds products and falls back to lists', () => {
    assert.equal(compressCells(expandCells('*/*/*', MATRIX), MATRIX), 'all cells');
    assert.equal(compressCells(['mobile/light/en', 'mobile/dark/en', 'mobile/light/vi', 'mobile/dark/vi'], MATRIX), 'mobile/*/*');
    assert.equal(compressCells(['desktop/light/vi', 'desktop/dark/vi'], MATRIX), 'desktop/*/vi');
    assert.equal(compressCells(expandCells('*/dark/*', MATRIX), MATRIX), '*/dark/*');
    assert.equal(compressCells(['mobile/light/en', 'tablet/light/en'], MATRIX), 'mobile,tablet/light/en');
    assert.equal(compressCells(['mobile/light/en', 'tablet/dark/en'], MATRIX), 'mobile/light/en + tablet/dark/en');
    assert.equal(compressCells(['mobile/light/en'], { viewports: ['mobile'], schemes: ['light'], locales: ['en'] }), 'all cells');
  });

  test('expandCells round-trips', () => {
    for (const p of ['mobile/*/*', '*/dark/*', 'desktop/*/vi', 'mobile,tablet/light/en']) {
      assert.equal(compressCells(expandCells(p, MATRIX), MATRIX), p);
    }
    assert.equal(expandCells('all cells', MATRIX).length, 12);
    assert.throws(() => expandCells('mobile/dark', MATRIX), /bad cell pattern/);
  });
});

describe('buildReport + renderMarkdown', () => {
  test('counts per cell, per type, and the exit code', () => {
    const { report } = sampleReport();
    assert.equal(report.summary.errors, 2);
    assert.equal(report.summary.warnings, 1);
    assert.equal(report.summary.exitCode, 1);
    assert.deepEqual(report.summary.byType['page-overflow'], { errors: 1, warnings: 0 });
    const mobileLightEn = report.cells.find((c) => c.route === '/' && c.key === 'mobile/light/en');
    assert.equal(mobileLightEn.errors, 1);
    assert.equal(mobileLightEn.warnings, 1);
    const settings = report.cells.filter((c) => c.route === '/settings');
    assert.ok(settings.every((c) => c.errors === 1 && c.warnings === 0));
    assert.equal(report.durationMs, 12000);
  });

  test('crashed cells make the exit code 2', () => {
    const opts = parseLookArgs(['http://x.test']);
    const report = buildReport({
      version: '0',
      runId: 'r',
      startedAt: new Date(),
      finishedAt: new Date(),
      options: { ...opts, darkStrategyText: 'media' },
      cells: [cell('/', 'mobile', 'light', 'en', { status: 'failed', crashed: true })],
      issues: [],
      notes: [],
    });
    assert.equal(report.summary.exitCode, 2);
  });

  test('markdown: summary table, issues grouped by type with compressed cells', () => {
    const { report } = sampleReport();
    const md = renderMarkdown(report);
    assert.match(md, /^# Mantis report/);
    assert.match(md, /\*\*2 errors · 1 warning\*\* \(exit 1\)/);
    assert.match(md, /\| route · locale \| mobile light \| mobile dark \| tablet light \| tablet dark \| desktop light \| desktop dark \|/);
    assert.match(md, /\| `\/` · en \| 1E 1W \| 1E \| ok \| ok \| ok \| ok \|/);
    assert.match(md, /\| `\/settings` · vi \| 1E \| 1E \| 1E \| 1E \| 1E \| 1E \|/);
    assert.match(md, /### page-overflow \(1 error\)\n\n- \*\*#1\*\* error `#promo` · mobile\/\*\/\* · route `\/`\n {2}wide — `shots\/home__mobile__light__en\.png`/);
    assert.match(md, /### console \(1 error\)\n\n- \*\*#2\*\* error · all cells · route `\/settings`/);
    assert.match(md, /### tap-target \(1 warning\)/);
    assert.ok(md.indexOf('### console') < md.indexOf('### tap-target'), 'types with errors come first');
    assert.match(md, /## Notes\n\n- a note/);
  });

  test('markdown: clean run', () => {
    const opts = parseLookArgs(['http://x.test']);
    const report = buildReport({
      version: '0',
      runId: 'r',
      startedAt: new Date(),
      finishedAt: new Date(),
      options: { ...opts, darkStrategyText: 'media' },
      cells: [cell('/', 'mobile', 'light', 'en')],
      issues: [],
      notes: [],
    });
    const md = renderMarkdown(report);
    assert.match(md, /No issues found\./);
    assert.match(md, /\*\*0 errors · 0 warnings\*\* \(exit 0\)/);
  });
});

describe('color', () => {
  test('WCAG contrast reference values', () => {
    assert.equal(contrastRatio([170, 170, 170], [255, 255, 255]).toFixed(2), '2.32');
    assert.equal(contrastRatio([0, 0, 0], [255, 255, 255]).toFixed(0), '21');
    assert.equal(luminance([255, 255, 255]), 1);
    assert.equal(toHex([127, 29, 29]), '#7f1d1d');
    assert.equal(isLargeText(24, 400), true);
    assert.equal(isLargeText(19, 700), true);
    assert.equal(isLargeText(18, 700), false);
  });
});

describe('theme-leak comparison', () => {
  const page = (pageBg, els) => ({ pageBg, els });
  const el = (k, extra) => ({ k, sig: 'div.', w: 300, h: 200, bg: [0, 0, 0, 0], bi: false, rep: false, ...extra });
  const light = page([255, 255, 255], [
    el('html/body[1]/div[0]', { bg: [255, 255, 255, 1] }),
    el('html/body[1]/div[0]/p[0]', { c: [229, 231, 235, 1], eb: [255, 255, 255], fs: 16, fw: '400', op: 1, t: 'card text' }),
    el('html/body[1]/a[1]', { bg: [79, 70, 229, 1], c: [255, 255, 255, 1], eb: [79, 70, 229], fs: 16, fw: '600', op: 1, t: 'Buy' }),
    el('html/body[1]/h2[2]', { c: [17, 24, 39, 1], eb: [255, 255, 255], fs: 20, fw: '700', op: 1, t: 'Title' }),
  ]);
  const dark = page([11, 16, 32], [
    el('html/body[1]/div[0]', { bg: [255, 255, 255, 1] }),
    el('html/body[1]/div[0]/p[0]', { c: [229, 231, 235, 1], eb: [255, 255, 255], fs: 16, fw: '400', op: 1, t: 'card text' }),
    el('html/body[1]/a[1]', { bg: [79, 70, 229, 1], c: [255, 255, 255, 1], eb: [79, 70, 229], fs: 16, fw: '600', op: 1, t: 'Buy' }),
    el('html/body[1]/h2[2]', { c: [17, 24, 39, 1], eb: [11, 16, 32], fs: 20, fw: '700', op: 1, t: 'Title' }),
  ]);

  test('flags a light container and a hard-coded text color, not brand-colored buttons', () => {
    const r = compareSnapshots(light, dark);
    assert.equal(r.flipped, true);
    assert.deepEqual(r.findings.map((f) => [f.kind, f.key]), [
      ['container', 'html/body[1]/div[0]'],
      ['text', 'html/body[1]/h2[2]'],
    ]);
    assert.equal(r.findings[0].evidence.unreadableText, 1);
    assert.equal(r.findings[0].severity, 'error');
  });

  test('no findings when the page background did not flip', () => {
    const r = compareSnapshots(light, page([255, 255, 255], light.els));
    assert.equal(r.flipped, false);
    assert.equal(r.unchanged, true);
    assert.deepEqual(r.findings, []);
  });

  test('elements whose signature changed are not compared', () => {
    const changed = page(dark.pageBg, dark.els.map((e) => ({ ...e, sig: 'section.other' })));
    assert.deepEqual(compareSnapshots(light, changed).findings, []);
  });
});

describe('PLANTED.json scoring', () => {
  const planted = {
    matrix: { routes: ['/'], viewports: ['mobile', 'desktop'], schemes: ['light'], locales: ['en'] },
    bugs: [
      { id: 'a', route: '/', expect: [{ type: 'page-overflow', severity: 'error', selector: '#a', cells: 'mobile/*/*' }] },
      { id: 'b', route: '/', expect: [{ type: 'contrast', severity: 'error', selector: '#card', descendants: true, minIssues: 2, cells: '*/*/*' }] },
    ],
  };
  const issue = (id, type, selector, cells, extra = {}) => ({ id, type, severity: 'error', route: '/', selector, cells, message: '', evidence: {}, ...extra });

  test('perfect report', () => {
    const report = { issues: [issue(1, 'page-overflow', '#a', ['mobile/light/en']), issue(2, 'contrast', '#card p', ['mobile/light/en', 'desktop/light/en']), issue(3, 'contrast', '#card > h3', ['mobile/light/en', 'desktop/light/en'])] };
    const s = evaluate(report, planted);
    assert.ok(s.expectations.every((e) => e.ok));
    assert.deepEqual(s.unexpected, []);
    assert.match(formatScore(s), /contrast\s+1\/1\s+2\/2/);
  });

  test('missing cells, extra cells and false positives are reported', () => {
    const report = { issues: [issue(1, 'page-overflow', '#a', ['mobile/light/en', 'desktop/light/en']), issue(2, 'contrast', '#card p', ['mobile/light/en']), issue(3, 'overlap', '#z', ['mobile/light/en'])] };
    const s = evaluate(report, planted);
    assert.match(s.expectations[0].reason, /unexpected cells: #1 desktop\/light\/en/);
    assert.match(s.expectations[1].reason, /at least 2/);
    assert.deepEqual(s.unexpected.map((i) => i.id), [3]);
  });
});
