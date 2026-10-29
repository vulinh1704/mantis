/**
 * The project the sheets are made for, so they carry its name, logo, color and repo link.
 *
 * Read from the current directory: package.json `name`, the `origin` git remote (owner/repo, any
 * credentials in the URL dropped) and an optional `.mantis.json` that overrides any of them:
 *   { "name": "Lumen", "logo": "public/logo.svg", "brandColor": "#4f46e5", "repo": "acme/lumen", "qr": true }
 * `logo` is a path relative to the project or an http(s) URL; `repo` is a URL, `owner/repo` (GitHub)
 * or false to leave the link out; `qr: false` keeps the link but drops the QR code.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * `git@github.com:acme/lumen.git`, `https://user:token@gitlab.com/group/sub/repo` or `acme/lumen`
 * -> {slug: 'acme/lumen', url: 'https://github.com/acme/lumen'}; null when it is not a repo URL.
 * @param {string|null|undefined} remote
 */
export function parseRepo(remote) {
  const s = String(remote ?? '').trim();
  if (!s) return null;
  let host;
  let p;
  const scp = s.match(/^[\w.-]+@([^:/]+):(.+)$/);
  if (scp) {
    host = scp[1];
    p = scp[2];
  } else if (/^[\w.-]+\/[\w.-]+$/.test(s)) {
    host = 'github.com';
    p = s;
  } else {
    try {
      const u = new URL(s);
      if (!/^(https?|ssh|git):$/.test(u.protocol)) return null;
      host = u.hostname;
      p = u.pathname;
    } catch {
      return null;
    }
  }
  const parts = p.replace(/\.git\/?$/, '').split('/').filter(Boolean);
  if (parts.length < 2 || !host) return null;
  const slug = parts.join('/');
  return { slug, url: `https://${host}/${slug}` };
}

function gitRemote(cwd) {
  try {
    return execFileSync('git', ['config', '--get', 'remote.origin.url'], { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim();
  } catch {
    return null;
  }
}

const COLOR_RE = /^(#[0-9a-f]{3,8}|(rgb|hsl|oklch)a?\([\d\s.,%/a-z-]+\))$/i;

/**
 * @param {string} [cwd]
 * @returns {{name: string|null, logo: string|null, brandColor: string|null, repo: {slug: string, url: string}|null, qr: boolean}}
 */
export function projectInfo(cwd = process.cwd()) {
  const pkg = readJson(path.join(cwd, 'package.json'));
  const cfg = readJson(path.join(cwd, '.mantis.json')) ?? {};
  const name = String(cfg.name ?? pkg?.name ?? '').replace(/^@[^/]+\//, '').trim() || null;
  const repo = cfg.repo === false ? null : cfg.repo ? parseRepo(cfg.repo) : parseRepo(gitRemote(cwd));
  let logo = null;
  if (typeof cfg.logo === 'string' && cfg.logo.trim()) {
    const l = cfg.logo.trim();
    if (/^https?:\/\//i.test(l)) logo = l;
    else if (existsSync(path.resolve(cwd, l))) logo = pathToFileURL(path.resolve(cwd, l)).href;
  }
  const brandColor = typeof cfg.brandColor === 'string' && COLOR_RE.test(cfg.brandColor.trim()) ? cfg.brandColor.trim() : null;
  return { name, logo, brandColor, repo, qr: cfg.qr !== false };
}
