/**
 * Compare a perf run with an earlier one (the baseline): which metrics moved beyond the noise,
 * which findings were fixed and which are new, and whether a route got faster by getting emptier
 * (a perf cover-up: the hero image gone, text cut, controls lost).
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { UsageError, storageStateName } from '../options.js';
import { fmtKb, fmtMs, shortUrl } from './metrics.js';

/** Smallest change that counts, per metric, on top of the runs' own spread and 5%. */
const FLOOR = { lcp: 100, fcp: 100, tbt: 50, cls: 0.02, ttfb: 50, data: 100, load: 100, bytes: 10 * 1024, requests: 1 };
const RECEIPT = ['lcp', 'tbt', 'cls', 'bytes'];
const NAME = { lcp: 'LCP', fcp: 'FCP', tbt: 'TBT', cls: 'CLS', ttfb: 'TTFB', data: 'API data in', load: 'load', bytes: 'transferred', requests: 'requests' };
export const fmtMetric = (m, v) => (v == null ? '–' : m === 'cls' ? String(v) : m === 'bytes' ? fmtKb(v) : m === 'requests' ? String(v) : fmtMs(v));

/**
 * The run to compare with: null for `none`; the given perf run (or an out directory, meaning its
 * latest perf run); or, for `auto`, the most recent perf run of the same URL, profile and storage
 * state in `<out>/perf/runs`.
 */
export async function findPerfBaseline({ baseline = 'auto', out, url, profile, storageState }) {
  if (baseline === 'none') return null;
  const read = async (dir) => ({ dir, report: JSON.parse(await readFile(path.join(dir, 'perf.json'), 'utf8')) });
  if (baseline !== 'auto') {
    let dir = path.resolve(baseline);
    if (!existsSync(path.join(dir, 'perf.json')) && existsSync(path.join(dir, 'perf', 'latest', 'perf.json'))) dir = path.join(dir, 'perf', 'latest');
    if (!existsSync(path.join(dir, 'perf.json'))) throw new UsageError(`--baseline: no perf.json in ${baseline} (pass a perf run such as .mantis/perf/runs/<timestamp>)`);
    const run = await read(dir);
    if (run.report.profile?.name !== profile) throw new UsageError(`--baseline: ${baseline} was measured with --profile ${run.report.profile?.name}, this run with ${profile}: compare runs of the same profile`);
    return run;
  }
  const runsDir = path.resolve(out, 'perf', 'runs');
  if (!existsSync(runsDir)) return null;
  const session = storageStateName(storageState);
  for (const name of (await readdir(runsDir)).sort().reverse()) {
    try {
      const run = await read(path.join(runsDir, name));
      if (run.report.url === url && run.report.profile?.name === profile && (run.report.storageState ?? null) === session) return run;
    } catch {
      // unreadable or unfinished run: try an older one
    }
  }
  return null;
}

const round = (m, v) => (m === 'cls' ? Math.round(v * 1000) / 1000 : Math.round(v));

/**
 * How a metric moved. It counts only beyond the noise: the larger of either run's spread (max − min
 * over its visits), 5% of the baseline, and a floor per metric.
 */
export function metricDelta(m, before, after) {
  if (!before || !after || before.median == null || after.median == null) return null;
  const delta = after.median - before.median;
  const noise = Math.max(before.max - before.min, after.max - after.min, Math.abs(before.median) * 0.05, FLOOR[m] ?? 0);
  return { before: before.median, after: after.median, delta: round(m, delta), noise: round(m, noise), significant: Math.abs(delta) > noise, better: delta < 0 };
}

/**
 * Why a faster route may only be emptier: its LCP element downgraded, its text cut by more than 20%,
 * first-screen images, headings or controls gone. Only asked when a metric improved beyond the noise.
 */
export function emptierReasons(b, a, origin) {
  const reasons = [];
  const be = b.lcpElement;
  const ae = a.lcpElement;
  const area = (e) => (e?.rect ? e.rect.width * e.rect.height : 0);
  if (be) {
    const was = be.url ? `an image (\`${be.selector}\`, ${shortUrl(be.url, origin)})` : `\`${be.selector}\``;
    if (!ae) reasons.push(`the LCP element was ${was} and nothing replaced it`);
    else if (be.url && !ae.url) reasons.push(`the LCP element was ${was} and is now ${ae.tag} text${ae.text ? ` "${ae.text.slice(0, 40)}"` : ''}`);
    else if (area(ae) < 0.5 * area(be)) reasons.push(`the LCP element shrank from ${be.rect.width}×${be.rect.height} to ${ae.rect.width}×${ae.rect.height} (\`${ae.selector}\`)`);
  }
  const bi = b.inventory;
  const ai = a.inventory;
  if (bi && ai) {
    if (bi.textLength >= 100 && ai.textLength < 0.8 * bi.textLength) reasons.push(`visible text dropped from ${bi.textLength} to ${ai.textLength} characters (−${Math.round((1 - ai.textLength / bi.textLength) * 100)}%)`);
    if (ai.viewportImages < bi.viewportImages) reasons.push(`${bi.viewportImages - ai.viewportImages} of ${bi.viewportImages} image${bi.viewportImages === 1 ? '' : 's'} on the first screen ${bi.viewportImages - ai.viewportImages === 1 ? 'is' : 'are'} gone`);
    if (ai.headings < bi.headings) reasons.push(`headings ${bi.headings} → ${ai.headings}`);
    if (ai.controls < bi.controls) reasons.push(`links, buttons and inputs ${bi.controls} → ${ai.controls}`);
  }
  return reasons;
}

/**
 * Compare a run with its baseline.
 * @param {{dir: string, report: object}} base
 * @param {object} report  the current perf report (routes and ranked findings)
 */
export function comparePerf(base, report) {
  const origin = new URL(report.url).origin;
  const baseRoutes = new Map(base.report.routes.filter((r) => r.metrics).map((r) => [r.route, r]));
  const routes = [];
  const coverUps = [];
  for (const r of report.routes) {
    const b = baseRoutes.get(r.route);
    if (!b || !r.metrics) continue;
    const deltas = {};
    for (const m of Object.keys(NAME)) {
      const d = metricDelta(m, b.metrics[m], r.metrics[m]);
      if (d) deltas[m] = d;
    }
    routes.push({ route: r.route, deltas });
    const improved = ['lcp', 'fcp', 'tbt', 'cls', 'bytes'].filter((m) => deltas[m]?.significant && deltas[m].better);
    if (!improved.length) continue;
    const reasons = emptierReasons(b.visit, r.visit, origin);
    if (reasons.length) {
      coverUps.push({
        route: r.route,
        improved: improved.map((m) => `${NAME[m]} ${fmtMetric(m, deltas[m].before)} → ${fmtMetric(m, deltas[m].after)}`),
        reasons,
      });
    }
  }
  const compared = new Set(routes.map((r) => r.route));
  const coveredUp = new Set(coverUps.map((c) => c.route));
  const inCompared = (f) => f.routes.some((x) => compared.has(x));
  const now = new Set(report.findings.map((f) => f.id));
  const before = new Set(base.report.findings?.map((f) => f.id) ?? []);
  const brief = (f) => ({ id: f.id, title: f.title, routes: f.routes });
  const gone = (base.report.findings ?? []).filter((f) => inCompared(f) && !now.has(f.id));
  // A finding that went away on a route that got emptier was not fixed: it left with the content.
  const fixed = gone.filter((f) => !f.routes.some((x) => coveredUp.has(x))).map(brief);
  const goneWithContent = gone.filter((f) => f.routes.some((x) => coveredUp.has(x))).map(brief);
  const fresh = report.findings.filter((f) => inCompared(f) && !before.has(f.id)).map(brief);
  return { runId: base.report.runId, routes, fixed, new: fresh, goneWithContent, coverUps, receipt: receipt(routes[0]?.deltas ?? {}, fixed.length, fresh.length, coverUps.length) };
}

/** `LCP 4.8 s → 1.9 s · TBT 1.2 s → 210 ms · CLS ≈ 0.02 · 551 KB → 160 KB · 9 fixed · 0 new · 0 cover-ups` */
export function receipt(deltas, fixed, fresh, coverUps) {
  const parts = RECEIPT.filter((m) => deltas[m]).map((m) => {
    const d = deltas[m];
    return d.significant ? `${NAME[m]} ${fmtMetric(m, d.before)} → ${fmtMetric(m, d.after)}` : `${NAME[m]} ≈ ${fmtMetric(m, d.after)}`;
  });
  return [...parts, `${fixed} fixed`, `${fresh} new`, `${coverUps} cover-up${coverUps === 1 ? '' : 's'}`].join(' · ');
}

export const METRIC_NAME = NAME;
