/** Thresholds, ratings and formatting shared by the perf report and its findings. */

/** Core Web Vitals and Lighthouse thresholds: [good up to, poor above]. */
export const THRESHOLDS = Object.freeze({
  lcp: [2500, 4000],
  fcp: [1800, 3000],
  cls: [0.1, 0.25],
  tbt: [200, 600],
  ttfb: [800, 1800],
});

export function rating(metric, value) {
  const t = THRESHOLDS[metric];
  if (!t || value == null) return null;
  return value <= t[0] ? 'good' : value <= t[1] ? 'needs-improvement' : 'poor';
}

export function median(values) {
  const v = values.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round(((v[m - 1] + v[m]) / 2) * 1000) / 1000;
}

export const fmtMs = (ms) => (ms == null ? '–' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
export const fmtKb = (b) => (b == null ? '–' : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

/** Shorten a URL to its path when it is on the page's origin. */
export function shortUrl(url, origin) {
  try {
    const u = new URL(url);
    const s = u.origin === origin ? u.pathname + u.search : `${u.host}${u.pathname}`;
    return s.length > 70 ? `${s.slice(0, 67)}…` : s;
  } catch {
    return url;
  }
}

/**
 * The site a URL belongs to, to tell the app's own files from third parties: the registrable domain
 * (shop.example.com and cdn.example.com are one site), or host and port for IPs and localhost, where
 * the port is what tells two servers apart.
 */
export function siteOf(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  if (/^(\d+\.){3}\d+$|^\[|^localhost$/.test(u.hostname)) return u.host;
  const parts = u.hostname.split('.');
  const n = parts.length > 2 && parts[parts.length - 1].length === 2 && /^(co|com|net|org|gov|edu|ac)$/.test(parts[parts.length - 2]) ? 3 : 2;
  return parts.slice(-n).join('.');
}
