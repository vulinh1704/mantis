/**
 * Server for fixtures/slow-app: its static pages plus what a real backend and a vendor add.
 * - the API answers after a delay: /api/config 200 ms, /api/user 300 ms, /api/orders 500 ms,
 *   /api/products/<id> 250 ms;
 * - /flags.js (synchronous in <head>) arrives after 300 ms;
 * - /hero.png is a 1200×750 photo-like PNG made at start, /big.js a bundle that is mostly unused,
 *   /@vite/client an empty module (dev.html pretends to be a Vite dev server);
 * - a second server on another port plays a third-party vendor: /widget.js (after 200 ms, then
 *   blocks the main thread) and a /collect beacon (after 400 ms). {{VENDOR}} in HTML is its origin;
 * - nothing is cached.
 *
 * Usage as a script: node test/helpers/slow-server.js [port]
 */
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { FIXTURES } from './static-server.js';

const ROOT = path.join(FIXTURES, 'slow-app');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** A grayscale PNG with a gradient and a little noise, so it compresses like a photo, not like a flat fill. */
export function photoPng(width = 1200, height = 750) {
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16;
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0;
    for (let x = 0; x < width; x++) raw[y * (width + 1) + 1 + x] = (((x >> 2) + (y >> 2)) & 0xff) ^ (rand() & 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A bundle of 1500 small features of which the page calls one. */
function bigScript() {
  const fns = Array.from({ length: 1500 }, (_, i) => `function feature${i}(input) { const out = []; for (const x of input) out.push(x * ${i + 1} + ${i % 7}); return out.reduce((a, b) => a + b, 0); }`);
  return `// Every feature the app has, shipped to every page.\n${fns.join('\n')}\nwindow.FEATURE_CHECK = feature0([1, 2, 3]);\n`;
}

const API = {
  '/api/config': [200, () => ({ currency: 'EUR', points: 10000 })],
  '/api/user': [300, () => ({ id: 7, name: 'Ada' })],
  '/api/orders': [500, () => [1, 2, 3, 4, 5].map((n) => ({ id: 100 + n, product: n, status: n % 2 ? 'shipped' : 'packing' }))],
};

function send(res, status, type, body) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

async function listen(handler, port, host) {
  const server = http.createServer((req, res) => {
    handler(req, res).catch((err) => send(res, 500, 'text/plain', String(err)));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return server;
}

/**
 * @param {{port?: number, host?: string}} [opts]
 * @returns {Promise<{url: string, vendorUrl: string, close: () => Promise<void>}>}
 */
export async function startSlowServer({ port = 0, host = '127.0.0.1' } = {}) {
  const hero = photoPng();
  const big = bigScript();
  const vendor = await listen(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/widget.js') {
      await sleep(200);
      return send(res, 200, TYPES['.js'], `// Chat widget: starts its whole UI at once and phones home.
(function bootChatWidget() {
  let x = 0;
  for (let i = 0; i < 1e8; i++) x += Math.sqrt(i);
  window.__chat = x;
  fetch(new URL('/collect', document.currentScript.src), { method: 'POST', body: '{}', mode: 'no-cors' });
})();
`);
    }
    if (pathname === '/collect') {
      await sleep(400);
      return send(res, 204, 'text/plain', '');
    }
    send(res, 404, 'text/plain', 'not found');
  }, 0, host);
  const vendorUrl = `http://${host}:${vendor.address().port}`;
  const app = await listen(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://x');
    const api = API[pathname];
    if (api) {
      await sleep(api[0]);
      return send(res, 200, 'application/json', JSON.stringify(api[1]()));
    }
    const product = pathname.match(/^\/api\/products\/(\d+)$/);
    if (product) {
      await sleep(250);
      return send(res, 200, 'application/json', JSON.stringify({ id: Number(product[1]), name: `Product ${product[1]}` }));
    }
    if (pathname === '/hero.png') return send(res, 200, 'image/png', hero);
    if (pathname === '/big.js') return send(res, 200, TYPES['.js'], big);
    if (pathname === '/@vite/client') return send(res, 200, TYPES['.js'], '// stands in for the Vite client\n');
    if (pathname === '/flags.js') await sleep(300);
    const file = pathname === '/' ? 'index.html' : /^\/[\w-]+$/.test(pathname) ? `${pathname.slice(1)}.html` : pathname.slice(1);
    if (!/^[\w.-]+$/.test(file)) return send(res, 404, TYPES['.html'], '<!doctype html><title>404</title><h1>404</h1>');
    let body;
    try {
      body = await readFile(path.join(ROOT, file), 'utf8');
    } catch {
      return send(res, 404, TYPES['.html'], '<!doctype html><title>404</title><h1>404</h1>');
    }
    send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', body.replaceAll('{{VENDOR}}', vendorUrl));
  }, port, host);
  const close = (s) => new Promise((resolve) => {
    s.closeAllConnections?.();
    s.close(() => resolve());
  });
  return {
    url: `http://${host}:${app.address().port}`,
    vendorUrl,
    close: async () => {
      await Promise.all([close(app), close(vendor)]);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const s = await startSlowServer({ port: Number(process.argv[2] || 4330) });
  process.stdout.write(`slow-app at ${s.url} (vendor at ${s.vendorUrl})\n`);
}
