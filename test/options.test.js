import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
  LOOK_DEFAULTS,
  UsageError,
  normalizeRoutes,
  parseDarkStrategy,
  parseLookArgs,
  parseProofArgs,
  parseViewport,
  readStorageState,
  routeSlug,
  splitList,
  undoMsysPath,
  storageStateName,
} from '../src/options.js';

describe('parseLookArgs', () => {
  test('defaults match the documented contract', () => {
    const o = parseLookArgs(['http://localhost:3000']);
    assert.equal(o.url, 'http://localhost:3000/');
    assert.deepEqual(o.routes, ['/']);
    assert.deepEqual(o.viewports.map((v) => [v.name, v.width, v.height]), [
      ['mobile', 360, 740],
      ['tablet', 768, 1024],
      ['desktop', 1440, 900],
    ]);
    assert.deepEqual(o.schemes, ['light', 'dark']);
    assert.deepEqual(o.locales, ['en']);
    assert.deepEqual(o.darkStrategy, { kind: 'media' });
    assert.equal(o.out, '.mantis');
    assert.equal(o.wait, 0);
    assert.equal(o.json, false);
    assert.equal(o.concurrency, LOOK_DEFAULTS.concurrency);
  });

  test('the URL path is the default route', () => {
    assert.deepEqual(parseLookArgs(['http://example.com/app/pricing?x=1']).routes, ['/app/pricing?x=1']);
  });

  test('bare localhost gets http://', () => {
    assert.equal(parseLookArgs(['localhost:5173']).url, 'http://localhost:5173/');
  });

  test('all options', () => {
    const o = parseLookArgs([
      'http://127.0.0.1:4321', '--routes', '/,settings, /settings,/team?tab=2', '--viewports', 'mobile,desktop,phone=390x844',
      '--schemes', 'dark,light', '--locales', 'en,vi,de-DE', '--dark-strategy', 'attr:data-theme=night',
      '--out', 'out/m', '--wait', '250', '--json', '--concurrency', '2', '--timeout', '15000',
    ]);
    assert.deepEqual(o.routes, ['/', '/settings', '/team?tab=2']);
    assert.deepEqual(o.viewports.map((v) => v.name), ['mobile', 'desktop', 'phone']);
    assert.deepEqual(o.viewports[2], { name: 'phone', width: 390, height: 844, isMobile: true, hasTouch: true });
    assert.deepEqual(o.schemes, ['light', 'dark'], 'light always runs before dark');
    assert.deepEqual(o.locales, ['en', 'vi', 'de-DE']);
    assert.deepEqual(o.darkStrategy, { kind: 'attr', name: 'data-theme', value: 'night' });
    assert.equal(o.out, 'out/m');
    assert.equal(o.wait, 250);
    assert.equal(o.json, true);
    assert.equal(o.concurrency, 2);
    assert.equal(o.timeout, 15000);
  });

  test('usage errors', () => {
    const bad = [
      [[], /missing <url>/],
      [['notaurl'], /invalid URL/],
      [['ftp://x.org'], /only http/],
      [['http://a', 'http://b'], /unexpected argument/],
      [['http://a', '--viewports', 'phablet'], /unknown viewport/],
      [['http://a', '--viewports', 'mobile,mobile=390x844'], /duplicate viewport/],
      [['http://a', '--schemes', 'sepia'], /unknown scheme/],
      [['http://a', '--locales', 'en_US'], /invalid locale/],
      [['http://a', '--dark-strategy', 'toggle'], /invalid --dark-strategy/],
      [['http://a', '--wait', '-5'], /--wait/],
      [['http://a', '--wait', 'soon'], /--wait must be a whole number/],
      [['http://a', '--routes', ''], /--routes is empty/],
      [['http://a', '--routes', 'https://other.org/x'], /different origin/],
      [['http://a', '--frobnicate'], /Unknown option/],
    ];
    for (const [args, re] of bad) {
      assert.throws(() => parseLookArgs(args), (err) => err instanceof UsageError && re.test(err.message), `args: ${args.join(' ')}`);
    }
  });
});

describe('helpers', () => {
  test('parseViewport', () => {
    assert.deepEqual(parseViewport('tablet'), { name: 'tablet', width: 768, height: 1024, isMobile: true, hasTouch: true });
    assert.deepEqual(parseViewport('1280x720'), { name: '1280x720', width: 1280, height: 720, isMobile: false, hasTouch: false });
    assert.throws(() => parseViewport('10x10'), /out of range/);
  });

  test('parseDarkStrategy', () => {
    assert.deepEqual(parseDarkStrategy('media'), { kind: 'media' });
    assert.deepEqual(parseDarkStrategy('class:dark'), { kind: 'class', name: 'dark' });
    assert.deepEqual(parseDarkStrategy('attr:data-theme=dark'), { kind: 'attr', name: 'data-theme', value: 'dark' });
    assert.deepEqual(parseDarkStrategy('attr:data-mode'), { kind: 'attr', name: 'data-mode', value: 'dark' });
    assert.throws(() => parseDarkStrategy('class:'), UsageError);
  });

  test('routeSlug', () => {
    assert.equal(routeSlug('/'), 'home');
    assert.equal(routeSlug('/settings'), 'settings');
    assert.equal(routeSlug('/settings/team?tab=2'), 'settings-team-tab-2');
    assert.equal(routeSlug('/About.html'), 'about');
  });

  test('normalizeRoutes and splitList', () => {
    const base = new URL('http://localhost:3000/');
    assert.deepEqual(normalizeRoutes(['/', 'a', 'http://localhost:3000/b?c=1', '/a'], base), ['/', '/a', '/b?c=1']);
    assert.deepEqual(splitList(' a, b ,,a,c '), ['a', 'b', 'c']);
  });
});

describe('parseProofArgs', () => {
  test('sheet only', () => {
    const o = parseProofArgs(['--before', 'a', '--after', 'b']);
    assert.equal(o.before, 'a');
    assert.equal(o.after, 'b');
    assert.equal(o.out, '.mantis/proof.png');
    assert.equal(o.video, false);
    assert.equal(o.videoOut, '.mantis/proof.mp4');
  });

  test('video', () => {
    const o = parseProofArgs(['--video', '--before-url', 'http://a.test', '--after-url', 'http://b.test', '--out', 'x/p.png', '--viewport', 'desktop', '--dark-strategy', 'class:dark']);
    assert.equal(o.video, true);
    assert.equal(o.before, null);
    assert.equal(o.videoOut, 'x/p.mp4');
    assert.equal(o.viewport.name, 'desktop');
    assert.deepEqual(o.darkStrategy, { kind: 'class', name: 'dark' });
    assert.deepEqual(parseProofArgs(['--before', 'a', '--after', 'b']).darkStrategy, { kind: 'media' });
  });

  test('usage errors', () => {
    assert.throws(() => parseProofArgs([]), /nothing to do/);
    assert.throws(() => parseProofArgs(['--before', 'a']), /together/);
    assert.throws(() => parseProofArgs(['--video', '--before-url', 'http://a']), /--after-url/);
    assert.throws(() => parseProofArgs(['--before', 'a', '--after', 'b', '--out', 'p.jpg']), /\.png/);
  });
});

describe('--storage-state', () => {
  test('look and proof resolve the path; it is off by default', () => {
    assert.equal(parseLookArgs(['http://localhost:3000']).storageState, null);
    assert.equal(parseLookArgs(['http://localhost:3000', '--storage-state', 'auth.json']).storageState, path.resolve('auth.json'));
    const p = parseProofArgs(['--video', '--before-url', 'http://a.test', '--after-url', 'http://b.test', '--storage-state', 'x/auth.json']);
    assert.equal(p.storageState, path.resolve('x/auth.json'));
    assert.throws(() => parseLookArgs(['http://localhost:3000', '--storage-state', ' ']), /--storage-state is empty/);
  });

  test('readStorageState accepts cookies, origins or both and rejects anything else', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mantis-state-'));
    const write = async (name, data) => {
      const file = path.join(dir, name);
      await writeFile(file, typeof data === 'string' ? data : JSON.stringify(data));
      return file;
    };
    try {
      assert.deepEqual(await readStorageState(await write('o.json', { origins: [{ origin: 'http://a.test', localStorage: [] }] })),
        { cookies: [], origins: [{ origin: 'http://a.test', localStorage: [] }] });
      assert.deepEqual(await readStorageState(await write('c.json', { cookies: [{ name: 'sid' }] })), { cookies: [{ name: 'sid' }], origins: [] });
      await assert.rejects(readStorageState(path.join(dir, 'missing.json')), /no such file/);
      await assert.rejects(readStorageState(await write('bad.json', '{nope')), UsageError);
      await assert.rejects(readStorageState(await write('arr.json', [])), /not a Playwright storage state/);
      await assert.rejects(readStorageState(await write('tok.json', { token: 'x' })), /not a Playwright storage state/);
      await assert.rejects(readStorageState(await write('mixed.json', { cookies: {}, origins: [] })), /not a Playwright storage state/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('storageStateName shows only the file name', () => {
    assert.equal(storageStateName(null), null);
    assert.equal(storageStateName(path.join('a', 'b', 'auth.json')), 'auth.json');
  });
});

describe('Git Bash route paths', () => {
  const gitBash = { EXEPATH: 'C:\Program Files\Git\bin' };

  test('undoMsysPath turns the Windows path Git Bash made back into the route', () => {
    assert.equal(undoMsysPath('C:/Program Files/Git/', gitBash), '/');
    assert.equal(undoMsysPath('C:/Program Files/Git/settings.html', gitBash), '/settings.html');
    assert.equal(undoMsysPath('C:/Program Files/Git/app/Git/intro', gitBash), '/app/Git/intro');
    assert.equal(undoMsysPath('D:/Tools/PortableGit/settings', {}), '/settings', 'without EXEPATH the Git folder is guessed');
    assert.equal(undoMsysPath('/settings', gitBash), '/settings');
    assert.throws(() => undoMsysPath('D:/work/site/index.html', {}), /Git Bash rewrites arguments/);
  });

  test('parseLookArgs accepts what Git Bash passes for --routes /,/settings.html', () => {
    const o = parseLookArgs(['http://localhost:4351', '--routes', 'C:/Program Files/Git/,/settings.html']);
    assert.deepEqual(o.routes, ['/', '/settings.html']);
  });
});
