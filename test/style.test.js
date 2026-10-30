/**
 * House style: buildStyle/findDrift/offStyleIssues on hand-made collections, then `mantis learn`
 * on clean-app and a `look` at the same app after an "agent edit" that hard-codes near copies of
 * house values (CSS injected behind the same URL).
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { parseLearnArgs } from '../src/options.js';
import { buildStyle, offStyleIssues } from '../src/style.js';
import { runCli } from './helpers/cli.js';
import { FIXTURES, startStaticServer } from './helpers/static-server.js';

const g = (value, uses, roles = {}, text = '') => ({ value, uses, roles, examples: [{ sel: `#e-${value}`, rect: { x: 0, y: 0, width: 10, height: 10 }, text }] });

function sample() {
  const data = {
    elements: 100,
    sheetsSkipped: 0,
    groups: {
      color: [g('#0f172a', 40, { text: 40 }), g('#4f46e5', 30, { bg: 30 }), g('#4f46e6', 1, { bg: 1 }), g('#4338ca', 1, { text: 1 })],
      fontSize: [g(16, 50), g(14, 20), g(15.5, 1), g(15, 1), g(32, 4)],
      fontFamily: [g('Inter', 70)],
      fontWeight: [g(400, 60), g(700, 10)],
      radius: [g(16, 12), g(8, 9), g(15, 1), g('full', 3)],
      spacing: [g(16, 40), g(8, 30)],
      duration: [g(150, 6)],
      easing: [g('ease', 6)],
    },
    tokens: {
      '--text': { kind: 'color', value: '#0f172a' },
      '--primary': { kind: 'color', value: '#4f46e5' },
      '--radius': { kind: 'length', value: 16 },
      '--gap': { kind: 'length', value: 16 },
      '--text-base': { kind: 'length', value: 16 },
    },
  };
  return buildStyle([{ route: '/', viewport: 'mobile', scheme: 'light', data }], {
    url: 'http://a.test/', routes: ['/'], viewports: ['mobile'], schemes: ['light'], version: 'test', learnedAt: new Date(0),
  });
}

describe('buildStyle', () => {
  test('values are counted, sorted by use and named by the tokens of their kind', () => {
    const s = sample();
    assert.deepEqual(s.colors.light.map((e) => e.value), ['#0f172a', '#4f46e5', '#4338ca', '#4f46e6']);
    assert.deepEqual(s.colors.light[1].tokens, ['--primary']);
    assert.deepEqual(s.radius.find((e) => e.value === 16).tokens, ['--radius']);
    assert.deepEqual(s.spacing.find((e) => e.value === 16).tokens, ['--gap']);
    assert.deepEqual(s.fontSize.find((e) => e.value === 16).tokens, ['--text-base']);
  });

  test('near-duplicates: rare values a hair from a common one, not rare values far from everything', () => {
    const drift = sample().drift.map((d) => `${d.kind} ${d.value}~${d.near}`);
    assert.deepEqual(drift.sort(), ['color #4f46e6~#4f46e5', 'fontSize 15.5~16', 'radius 15~16']);
  });
});

describe('offStyleIssues', () => {
  const style = sample();
  const cell = (groups) => ({ groups });

  test('flags near copies of house values and foreign fonts, not house values or far-off ones', () => {
    const issues = offStyleIssues(style, 'light', cell({
      color: [g('#0f172a', 3, { text: 3 }), g('#10172b', 2, { text: 2 }, 'Pricing'), g('#ff00aa', 1, { bg: 1 })],
      fontSize: [g(16, 5), g(17, 1), g(24, 1)],
      radius: [g(16, 2), g(13, 1)],
      fontFamily: [g('Inter', 5), g('Georgia', 1)],
    }));
    const byKind = Object.fromEntries(issues.map((i) => [`${i.evidence.kind} ${i.evidence.value}`, i]));
    assert.deepEqual(Object.keys(byKind).sort(), ['color #10172b', 'fontFamily Georgia', 'fontSize 17', 'radius 13']);
    const c = byKind['color #10172b'];
    assert.equal(c.severity, 'warn');
    assert.equal(c.evidence.near, '#0f172a');
    assert.deepEqual(c.evidence.nearTokens, ['--text']);
    assert.match(c.message, /Off-palette text color #10172b on 2 elements, e\.g\. "Pricing": ΔE 0\.\d from the house color #0f172a \(`--text`\)/);
    assert.match(byKind['fontSize 17'].message, /nearest is 16px \(`--text-base`\)/);
    assert.equal(byKind['radius 13'].evidence.near, 16, 'the common 16px, not the rare 15px copy');
  });

  test('no colors are checked for a scheme the style was not learned in', () => {
    const issues = offStyleIssues(style, 'dark', cell({ color: [g('#10172b', 1, { text: 1 })] }));
    assert.equal(issues.length, 0);
  });
});

describe('parseLearnArgs', () => {
  test('takes the look options without the check-only ones', () => {
    const o = parseLearnArgs(['http://localhost:3000', '--routes', '/,/settings', '--schemes', 'light']);
    assert.deepEqual(o.routes, ['/', '/settings']);
    assert.deepEqual(o.schemes, ['light']);
    assert.equal(o.out, '.mantis');
    for (const flag of ['--locales', '--locale-strategy', '--baseline', '--style', '--json']) {
      assert.throws(() => parseLearnArgs(['http://localhost:3000', flag, 'x']), /is a look option/);
    }
  });
});

describe('mantis learn + off-style (end-to-end)', { concurrency: false }, () => {
  let tmp;
  let server;
  const out = () => path.join(tmp, 'out');
  const MATRIX = ['--routes', '/', '--viewports', 'mobile,desktop', '--schemes', 'light'];
  const latest = () => JSON.parse(readFileSync(path.join(out(), 'latest', 'report.json'), 'utf8'));
  const offStyle = (r) => r.issues.filter((i) => i.type === 'off-style');

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-style-'));
    server = await startStaticServer(path.join(FIXTURES, 'clean-app'));
  });

  after(async () => {
    await server?.close();
    await rm(tmp, { recursive: true, force: true });
  });

  test('learn writes style.json, style.md and style.png with the app\'s tokens', { timeout: 120000 }, async () => {
    const res = await runCli(['learn', `${server.url}/`, '--routes', '/,/settings.html', '--viewports', 'mobile,desktop', '--out', out()]);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /House style: \d+ colors \(light\) · \d+ colors \(dark\)/);
    const style = JSON.parse(readFileSync(path.join(out(), 'style.json'), 'utf8'));
    assert.equal(style.kind, 'style');
    assert.equal(style.screens, 8);
    const primary = style.colors.light.find((e) => e.value === '#4f46e5');
    assert.deepEqual(primary?.tokens, ['--primary']);
    assert.deepEqual(style.colors.dark.find((e) => e.value === '#818cf8')?.tokens, ['--primary']);
    assert.deepEqual(style.radius.find((e) => e.value === 16)?.tokens, ['--radius']);
    assert.equal(style.fontFamily[0].value, 'Inter');
    assert.deepEqual(style.drift, []);
    assert.ok(existsSync(path.join(out(), 'style.png')));
    assert.match(readFileSync(path.join(out(), 'style.md'), 'utf8'), /## Colors · light/);
  });

  test('the unchanged app is not off-style against its own house style', { timeout: 120000 }, async () => {
    const res = await runCli(['look', `${server.url}/`, ...MATRIX, '--out', out()]);
    const report = latest();
    assert.equal(report.style?.file, 'style.json');
    assert.deepEqual(offStyle(report), [], res.stderr);
  });

  test('hard-coded near copies are off-style; a clearly new color is left alone', { timeout: 120000 }, async () => {
    server.setInject(`.plan-name { color: #10172b }
.plan-cta { border-radius: 15px }
.section-sub { font-size: 17.5px }
.quote { font-family: Georgia, serif }
.feature-icon { background: #ff00aa }`);
    await runCli(['look', `${server.url}/`, ...MATRIX, '--out', out()]);
    const found = offStyle(latest());
    const keys = found.map((i) => `${i.evidence.kind} ${i.evidence.value}`).sort();
    assert.deepEqual(keys, ['color #10172b', 'fontFamily Georgia', 'fontSize 17.5', 'radius 15'], JSON.stringify(found.map((i) => i.message), null, 2));
    const color = found.find((i) => i.evidence.kind === 'color');
    assert.equal(color.evidence.near, '#0f172a');
    assert.deepEqual(color.evidence.nearTokens, ['--text']);
    assert.match(color.selector, /plan-name/);
    assert.equal(found.find((i) => i.evidence.kind === 'radius').evidence.near, 16);
  });

  test('--style none switches the check off', { timeout: 120000 }, async () => {
    await runCli(['look', `${server.url}/`, ...MATRIX, '--out', out(), '--style', 'none']);
    const report = latest();
    assert.equal(report.style, null);
    assert.deepEqual(offStyle(report), []);
    server.setInject('');
  });
});

describe('mantis learn on buggy-app (end-to-end)', () => {
  test('finds the three planted near-duplicates and nothing else', { timeout: 120000 }, async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-drift-'));
    const server = await startStaticServer(path.join(FIXTURES, 'buggy-app'));
    try {
      const res = await runCli(['learn', `${server.url}/`, '--viewports', 'mobile,desktop', '--out', tmp]);
      assert.equal(res.code, 0, res.stderr);
      const style = JSON.parse(readFileSync(path.join(tmp, 'style.json'), 'utf8'));
      const drift = style.drift.map((d) => `${d.kind}${d.scheme ? `/${d.scheme}` : ''} ${d.value}~${d.near} ${d.examples[0]?.sel}`).sort();
      assert.deepEqual(drift, [
        'color/light #465569~#475569 #customers span.role',
        'fontSize 13.6~14 #customers span.role',
        'radius 15~16 #newsletter-submit',
      ]);
      assert.deepEqual(style.drift.find((d) => d.kind === 'radius').nearTokens, ['--radius']);
    } finally {
      await server.close();
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
