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
