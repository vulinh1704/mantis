import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { ensureOutDir } from '../src/util.js';

describe('ensureOutDir', () => {
  let tmp;
  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-out-'));
  });
  after(() => rm(tmp, { recursive: true, force: true }));

  test('a directory Mantis creates keeps its output out of git', async () => {
    const dir = path.join(tmp, 'reports', 'ui');
    await ensureOutDir(dir);
    assert.match(await readFile(path.join(dir, '.gitignore'), 'utf8'), /^\*$/m);
  });

  test('an existing .mantis gets one too, but a hand-written one is kept', async () => {
    const dir = path.join(tmp, 'a', '.mantis');
    await mkdir(dir, { recursive: true });
    await ensureOutDir(dir);
    assert.ok(existsSync(path.join(dir, '.gitignore')));

    const own = path.join(tmp, 'b', '.mantis');
    await mkdir(own, { recursive: true });
    await writeFile(path.join(own, '.gitignore'), '*\n!style.json\n');
    await ensureOutDir(own);
    assert.equal(await readFile(path.join(own, '.gitignore'), 'utf8'), '*\n!style.json\n');
  });

  test('a directory the user already had is left alone', async () => {
    const dir = path.join(tmp, 'docs');
    await mkdir(dir);
    await ensureOutDir(dir);
    assert.equal(existsSync(path.join(dir, '.gitignore')), false);
  });
});
