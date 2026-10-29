/**
 * The baseline comparison as pure functions: which element changes count as a cover-up, how lost
 * controls are matched, and how a run is summarized against its baseline.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { compareCell, coverUpKind, lostItems, summarize } from '../src/compare.js';
import { IssueRegistry } from '../src/report.js';

const probe = (over = {}) => ({ found: true, rendered: true, ratio: 1, font: 16, scale: 1, len: 20, text: 'Subscribe', tag: 'button', rect: { x: 10, y: 10, width: 100, height: 40 }, ...over });

describe('coverUpKind', () => {
  test('flags elements that were hidden, removed, shrunk, cut off or emptied', () => {
    assert.equal(coverUpKind(probe(), { found: false }), 'removed');
    assert.equal(coverUpKind(probe(), probe({ rendered: false })), 'hidden');
    assert.equal(coverUpKind(probe(), probe({ font: 9 })), 'shrunk');
    assert.equal(coverUpKind(probe({ font: 20 }), probe({ font: 15 })), 'shrunk');
    assert.equal(coverUpKind(probe(), probe({ scale: 0.7 })), 'shrunk');
    assert.equal(coverUpKind(probe(), probe({ ratio: 0.6 })), 'cut');
    assert.equal(coverUpKind(probe({ len: 40 }), probe({ len: 12 })), 'shortened');
  });

  test('accepts the changes an honest fix makes', () => {
    assert.equal(coverUpKind(probe(), probe({ rect: { x: 0, y: 80, width: 300, height: 48 } })), null, 'moved and resized');
    assert.equal(coverUpKind(probe({ font: 16 }), probe({ font: 14 })), null, 'a slightly smaller font');
    assert.equal(coverUpKind(probe({ ratio: 0.7 }), probe({ ratio: 1 })), null, 'more of it visible');
    assert.equal(coverUpKind(probe({ len: 20 }), probe({ len: 18 })), null, 'a reworded label');
    assert.equal(coverUpKind({ found: false }, { found: false }), null, 'never found in the baseline either');
    assert.equal(coverUpKind(probe({ rendered: false }), probe({ rendered: false })), null, 'hidden before too');
  });
});

describe('lostItems', () => {
  test('matches by kind + name, preferring the same selector, and returns what is left over', () => {
    const before = [
      { k: 'link: Home', s: '#a', r: [0, 0, 10, 10] },
      { k: 'link: Home', s: '#b', r: [0, 20, 10, 10] },
      { k: 'button: Open menu', s: '#menu', r: [300, 0, 36, 36] },
    ];
    const after = [{ k: 'link: Home', s: '#c', r: [0, 0, 10, 10] }];
    assert.deepEqual(lostItems(before, after).map((i) => i.s), ['#b', '#menu']);
    assert.deepEqual(lostItems(before, [...before]), []);
  });
});

function baseRun({ issues, probes = {}, inventory = [] }) {
  const registry = new IssueRegistry();
  for (const raw of issues) registry.add('/', 'mobile/light/en', raw, null);
  return {
    dir: '/tmp/base',
    report: { runId: 'base', issues: registry.issues, cells: [] },
    state: { cells: { '/|mobile/light/en': { probes, inventory } } },
  };
}

const overlap = { type: 'overlap', severity: 'error', selector: '#menu-toggle', rect: { x: 312, y: 12, width: 36, height: 36 }, message: 'overlap', evidence: { with: '#cta' } };
const contrast = { type: 'contrast', severity: 'error', selector: '#note', rect: { x: 0, y: 400, width: 200, height: 20 }, message: 'contrast', evidence: {} };

describe('compareCell', () => {
  const base = baseRun({
    issues: [overlap, contrast],
    probes: { '#menu-toggle': probe({ rect: overlap.rect }), '#cta': probe({ rect: { x: 280, y: 12, width: 70, height: 36 } }), '#note': probe() },
    inventory: [
      { k: 'button: Open menu', s: '#menu-toggle', r: [312, 12, 36, 36] },
      { k: 'link: Start free', s: '#cta', r: [280, 12, 70, 36] },
      { k: 'link: Pricing', s: '#pricing', r: [0, 900, 60, 20] },
    ],
  });
  const run = (after, raw = []) => compareCell({ route: '/', cell: 'mobile/light/en', raw, base, after });

  test('an issue that is still reported is not compared', () => {
    const out = run({ probes: { '#menu-toggle': probe({ rendered: false }) }, inventory: [] }, [overlap, contrast]);
    assert.deepEqual(out.filter((i) => i.type === 'cover-up'), []);
  });

  test('a hidden element behind a gone issue is a cover-up and not also reported as lost', () => {
    const after = {
      probes: { '#menu-toggle': probe({ rendered: false }), '#cta': probe(), '#note': probe() },
      inventory: [{ k: 'link: Start free', s: '#cta', r: [280, 12, 70, 36] }, { k: 'link: Pricing', s: '#pricing', r: [0, 900, 60, 20] }],
    };
    const out = run(after, [contrast]);
    assert.deepEqual(out.map((i) => [i.type, i.selector, i.evidence.kind]), [['cover-up', '#menu-toggle', 'hidden']]);
    assert.deepEqual(out[0].rect, overlap.rect, 'outlined where it was');
    assert.equal(out[0].evidence.was.type, 'overlap');
  });

  test('controls that vanished are lost warnings', () => {
    const after = {
      probes: { '#menu-toggle': probe(), '#cta': probe(), '#note': probe() },
      inventory: [{ k: 'button: Open menu', s: '#menu-toggle', r: [312, 12, 36, 36] }],
    };
    assert.deepEqual(run(after, [overlap, contrast]).map((i) => [i.type, i.severity, i.selector]), [['lost', 'warn', '#cta'], ['lost', 'warn', '#pricing']]);
  });

  test('layout shift, console and network issues are not checked for cover-ups', () => {
    const shift = { type: 'layout-shift', severity: 'warn', selector: '#hero', rect: null, message: 'cls', evidence: {}, dedupeKey: 'cls' };
    const live = baseRun({ issues: [shift], probes: { '#hero': probe() } });
    const out = compareCell({ route: '/', cell: 'mobile/light/en', raw: [], base: live, after: { probes: { '#hero': { found: false } }, inventory: [] } });
    assert.deepEqual(out, []);
  });

  test('more than five lost items in a cell are grouped into one warning (live content)', () => {
    const feed = Array.from({ length: 8 }, (_, i) => ({ k: `link: Story ${i}`, s: `#s${i}`, r: [0, 100 * i, 300, 40] }));
    const live = baseRun({ issues: [], inventory: feed });
    const out = compareCell({ route: '/', cell: 'mobile/light/en', raw: [], base: live, after: { probes: {}, inventory: [] } });
    assert.deepEqual(out.map((i) => [i.type, i.severity, i.dedupeKey, i.evidence.count, i.extraRects.length]), [['lost', 'warn', 'lost-group', 8, 7]]);
  });
});

describe('summarize', () => {
  test('fixed excludes covered-up issues; new counts issues absent from the baseline cell', () => {
    const base = baseRun({ issues: [overlap, contrast] });
    const registry = new IssueRegistry();
    registry.add('/', 'mobile/light/en', { type: 'cover-up', severity: 'error', selector: '#menu-toggle', rect: null, message: 'x', evidence: { kind: 'hidden', was: { id: 1 } } });
    registry.add('/', 'mobile/light/en', { type: 'clipped-text', severity: 'error', selector: '#nav', rect: null, message: 'y', evidence: {} });
    const s = summarize(base, registry, new Set(['/|mobile/light/en']));
    assert.deepEqual(s.fixed.map((f) => f.selector), ['#note']);
    assert.deepEqual(s.new, [2]);
    assert.equal(s.coverUps, 1);
    assert.equal(s.lost, 0);
  });
});
