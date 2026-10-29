/**
 * Tiny static file server for the fixtures (node:http, no dependencies).
 * - `/` serves index.html, `/settings` serves settings.html (clean URLs);
 * - missing files answer 404 with a small HTML page;
 * - responses are never cached, so every Mantis cell sees a cold load;
 * - setRoot() swaps the served directory and setInject() adds a <style> to every HTML page, so a
 *   test can "edit" the app behind the same URL the way an agent edits a dev server.
 *
 * Usage as a script: node test/helpers/static-server.js <dir> [port]
 */
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

async function isFile(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function resolveFile(root, urlPath) {
  let rel;
  try {
    rel = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const target = path.normalize(path.join(root, rel));
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  const candidates = rel.endsWith('/') ? [path.join(target, 'index.html')] : [target, `${target}.html`, path.join(target, 'index.html')];
  for (const c of candidates) if (await isFile(c)) return c;
  return null;
}

/**
 * @param {string} dir  directory to serve
 * @param {{port?: number, host?: string}} [opts]
 * @returns {Promise<{url: string, port: number, close: () => Promise<void>, setRoot: (dir: string) => void, setInject: (css: string) => void}>}
 */
export async function startStaticServer(dir, { port = 0, host = '127.0.0.1' } = {}) {
  let root = path.resolve(dir);
  let inject = '';
  const server = http.createServer(async (req, res) => {
    const file = await resolveFile(root, req.url || '/');
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('<!doctype html><title>404</title><h1>404 Not found</h1>');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    if (inject && file.endsWith('.html')) {
      res.end((await readFile(file, 'utf8')).replace('</head>', `<style data-injected>${inject}</style></head>`));
      return;
    }
    createReadStream(file).pipe(res);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const actual = server.address().port;
  return {
    url: `http://${host}:${actual}`,
    port: actual,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
    setRoot: (next) => {
      root = path.resolve(next);
    },
    setInject: (css) => {
      inject = css;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const dir = process.argv[2] || '.';
  const port = Number(process.argv[3] || 4321);
  const s = await startStaticServer(dir, { port });
  process.stdout.write(`serving ${path.resolve(dir)} at ${s.url}\n`);
}

export const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
