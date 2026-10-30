import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** Filesystem-safe local timestamp, e.g. `2026-10-26T14-30-05` (no colons: Windows-safe). */
export function runIdFor(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/**
 * Create an output directory. One that Mantis creates, and the default `.mantis`, get a
 * `.gitignore` of `*` so reports, screenshots and saved sessions never end up in a commit. A
 * directory the user already had under another name is left alone, and so is an existing `.gitignore`.
 */
export async function ensureOutDir(dir) {
  const existed = await stat(dir).then(() => true, () => false);
  await mkdir(dir, { recursive: true });
  if (existed && path.basename(dir) !== '.mantis') return;
  await writeFile(path.join(dir, '.gitignore'), '# Written by Mantis: keep its output out of git.\n*\n', { flag: 'wx' }).catch((err) => {
    if (err.code !== 'EEXIST') throw err;
  });
}

/** Create `<parent>/<name>` (or `<name>-2`, `-3`, ... if taken) and return its path. */
export async function uniqueDir(parent, name) {
  await mkdir(parent, { recursive: true });
  for (let i = 1; i < 1000; i++) {
    const dir = path.join(parent, i === 1 ? name : `${name}-${i}`);
    try {
      await stat(dir);
    } catch {
      await mkdir(dir, { recursive: true });
      return dir;
    }
  }
  throw new Error(`could not create a run directory under ${parent}`);
}

export function firstLine(text) {
  return String(text ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
}

export function sha1(text) {
  return createHash('sha1').update(text).digest('hex');
}

/** @template T @returns {{promise: Promise<T>, resolve: (v: T) => void, settled: boolean}} */
export function deferred() {
  const d = { settled: false };
  d.promise = new Promise((resolve) => {
    d.resolve = (v) => {
      if (d.settled) return;
      d.settled = true;
      resolve(v);
    };
  });
  return d;
}

/** Run `fn` over `items` with at most `n` in flight, starting items in order. */
export async function pool(items, n, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
}
