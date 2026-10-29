import { inflateSync } from 'node:zlib';

/**
 * Reading what is actually painted, for the cases where the DOM cannot say: text that sits on a
 * <canvas>, or that other (transparent) layers cover, so neither axe nor the computed styles know
 * its background. Screenshots are decoded here with node:zlib; no image library is needed.
 */

const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

/**
 * Decode an 8-bit, non-interlaced PNG (what Chromium screenshots are) into RGBA pixels.
 * @returns {{width: number, height: number, data: Buffer}}
 */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let width = 0;
  let height = 0;
  let depth = 0;
  let type = 0;
  let interlace = 0;
  const idat = [];
  for (let pos = 8; pos < buf.length; ) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      type = data[9];
      interlace = data[12];
    } else if (kind === 'IDAT') {
      idat.push(data);
    } else if (kind === 'IEND') {
      break;
    }
    pos += 12 + len;
  }
  const bpp = CHANNELS[type];
  if (depth !== 8 || interlace || !bpp) throw new Error(`unsupported PNG (depth ${depth}, color type ${type}, interlace ${interlace})`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= bpp ? cur[i - bpp] : 0;
      const up = prev[i];
      const upLeft = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        v += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const s = x * bpp;
      if (bpp >= 3) {
        out[o] = cur[s];
        out[o + 1] = cur[s + 1];
        out[o + 2] = cur[s + 2];
      } else {
        out[o] = out[o + 1] = out[o + 2] = cur[s];
      }
      out[o + 3] = bpp === 4 ? cur[s + 3] : bpp === 2 ? cur[s + 1] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

function clampRect(img, rect) {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.height));
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

/**
 * The most common color in a rectangle (colors bucketed at 4 bits per channel, the bucket's mean
 * returned), with the share of pixels it covers.
 * @returns {{color: number[], share: number} | null}
 */
export function dominantColor(img, rect, { step = 1 } = {}) {
  const r = clampRect(img, rect);
  if (!r) return null;
  const buckets = new Map();
  let total = 0;
  for (let y = r.y0; y < r.y1; y += step) {
    for (let x = r.x0; x < r.x1; x += step) {
      const o = (y * img.width + x) * 4;
      const key = ((img.data[o] >> 4) << 8) | ((img.data[o + 1] >> 4) << 4) | (img.data[o + 2] >> 4);
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = [0, 0, 0, 0]));
      b[0] += img.data[o];
      b[1] += img.data[o + 1];
      b[2] += img.data[o + 2];
      b[3]++;
      total++;
    }
  }
  let best = null;
  for (const b of buckets.values()) if (!best || b[3] > best[3]) best = b;
  if (!best) return null;
  return { color: [0, 1, 2].map((i) => Math.round(best[i] / best[3])), share: best[3] / total };
}

/** Whether any pixel in the rectangle is within `tolerance` (per channel) of a color. */
export function hasColorNear(img, rect, color, tolerance = 24) {
  const r = clampRect(img, rect);
  if (!r) return false;
  for (let y = r.y0; y < r.y1; y++) {
    for (let x = r.x0; x < r.x1; x++) {
      const o = (y * img.width + x) * 4;
      if (Math.abs(img.data[o] - color[0]) <= tolerance && Math.abs(img.data[o + 1] - color[1]) <= tolerance && Math.abs(img.data[o + 2] - color[2]) <= tolerance) return true;
    }
  }
  return false;
}

const MAX_HEIGHT = 8000;

/** Screenshot the page (whole document, CSS pixels, capped in height) and decode it. */
export async function capturePixels(page) {
  const size = await page.evaluate(() => ({
    w: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0),
    h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
  }));
  const opts = { fullPage: true, scale: 'css', animations: 'disabled', caret: 'hide', timeout: 60000 };
  if (size.h > MAX_HEIGHT) opts.clip = { x: 0, y: 0, width: size.w, height: MAX_HEIGHT };
  return decodePng(await page.screenshot(opts));
}

/**
 * The page background a user sees on canvas-based apps (whiteboards, maps, editors): when a
 * <canvas> or <video> covers at least half of the viewport, the color that fills most of the
 * viewport in a screenshot. Null for ordinary pages, where the DOM background is reliable.
 */
export async function paintedBackground(page) {
  const covered = await page.evaluate(() => {
    const area = innerWidth * innerHeight;
    return [...document.querySelectorAll('canvas, video')].some((el) => {
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      return w * h >= area * 0.5 && getComputedStyle(el).visibility !== 'hidden';
    });
  });
  if (!covered) return null;
  const img = decodePng(await page.screenshot({ scale: 'css', animations: 'disabled', caret: 'hide', timeout: 60000 }));
  const d = dominantColor(img, { x: 0, y: 0, width: img.width, height: img.height }, { step: 2 });
  return d && d.share >= 0.5 ? d.color : null;
}
