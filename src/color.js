/** Small sRGB color helpers shared by Node-side detector logic. Colors are [r, g, b(, a)] 0-255. */

function channel(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 = black, 1 = white). */
export function luminance(rgb) {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

/** WCAG contrast ratio between two opaque colors (1..21). */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Composite a possibly translucent color over an opaque one. */
export function over(top, bottom) {
  const a = top[3] === undefined ? 1 : top[3];
  return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a));
}

/** 0 for greys, up to 1 for fully saturated colors. */
export function chroma(rgb) {
  return (Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2])) / 255;
}

export function sameColor(a, b, tolerance = 6) {
  if (!a || !b) return false;
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance && Math.abs(a[2] - b[2]) <= tolerance;
}

export function toHex(rgb) {
  if (!rgb) return 'n/a';
  return '#' + [0, 1, 2].map((i) => Math.round(rgb[i]).toString(16).padStart(2, '0')).join('');
}

/** WCAG "large text": >= 24px, or >= 18.66px and bold. */
export function isLargeText(fontSizePx, fontWeight) {
  const w = Number(fontWeight) || (fontWeight === 'bold' ? 700 : 400);
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && w >= 700);
}

/** Parse `#rgb`, `#rrggbb` or `#rrggbbaa` to [r, g, b, a], or null. */
export function parseHex(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(hex ?? '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = (i) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? Math.round((n(6) / 255) * 100) / 100 : 1];
}

/** sRGB [r, g, b] (0-255) to CIE L*a*b* (D65). */
export function toLab(rgb) {
  const [r, g, b] = [0, 1, 2].map((i) => channel(rgb[i]));
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/**
 * CIEDE2000 difference between two L*a*b* colors. Below 1 nobody sees it, 2-3 is barely
 * noticeable side by side, above 5 the colors read as different.
 */
export function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C7 = (c) => c ** 7 / (c ** 7 + 25 ** 7);
  const G = 0.5 * (1 - Math.sqrt(C7((Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b, a) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const chromatic = C1p * C2p !== 0;
  let dhp = 0;
  if (chromatic) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbar = (L1 + L2) / 2;
  const Cbar = (C1p + C2p) / 2;
  let hbar = h1p + h2p;
  if (chromatic) {
    if (Math.abs(h1p - h2p) <= 180) hbar = (h1p + h2p) / 2;
    else hbar = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbar - 30) * rad) + 0.24 * Math.cos(2 * hbar * rad) +
    0.32 * Math.cos((3 * hbar + 6) * rad) - 0.2 * Math.cos((4 * hbar - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbar - 275) / 25) ** 2));
  const RT = -Math.sin(2 * dTheta * rad) * 2 * Math.sqrt(C7(Cbar));
  const SL = 1 + (0.015 * (Lbar - 50) ** 2) / Math.sqrt(20 + (Lbar - 50) ** 2);
  const SC = 1 + 0.045 * Cbar;
  const SH = 1 + 0.015 * Cbar * T;
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

/** ΔE2000 between two hex colors; Infinity when their alpha differs by more than 0.05. */
export function hexDistance(a, b) {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb || Math.abs(ca[3] - cb[3]) > 0.05) return Infinity;
  return deltaE2000(toLab(ca), toLab(cb));
}
