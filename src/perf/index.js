/**
 * `mantis perf`: measure every route with N cold, throttled visits, report the medians with their
 * spread, and keep the representative visit's details (LCP element, long animation frames,
 * requests with initiators, images, coverage) for the findings.
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchBrowser, preflight } from '../look.js';
import { readStorageState } from '../options.js';
import { VERSION, ensureOutDir, firstLine, runIdFor, uniqueDir } from '../util.js';
import { PERF_PROFILES, measureTrace, measureVisit } from './measure.js';

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

const METRICS = ['lcp', 'fcp', 'tbt', 'cls', 'ttfb', 'load', 'bytes', 'requests'];

/** Medians, ranges and ratings over the measured visits of one route. */
export function aggregate(visits) {
  const out = {};
  for (const m of METRICS) {
    const values = visits.map((v) => v.metrics[m]).filter((x) => x != null);
    if (!values.length) continue;
    const med = median(values);
    out[m] = { median: med, min: Math.min(...values), max: Math.max(...values), values, rating: rating(m, med) };
  }
  return out;
}

/** The visit closest to the median LCP (TBT when there is no LCP) stands for the route. */
export function representative(visits, agg) {
  const key = agg.lcp ? 'lcp' : 'tbt';
  const target = agg[key]?.median ?? 0;
  let best = 0;
  visits.forEach((v, i) => {
    if (Math.abs((v.metrics[key] ?? 0) - target) < Math.abs((visits[best].metrics[key] ?? 0) - target)) best = i;
  });
  return best;
}

/**
 * Give each request of a throttled visit the server's real wait from the unthrottled visit: the
 * n-th `GET /api/x` of one gets the n-th `GET /api/x` of the other.
 */
export function attachServerWait(requests, unthrottled) {
  const byKey = new Map();
  for (const r of unthrottled) {
    const key = `${r.method} ${r.url}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(r.wait);
  }
  return requests.map((r) => ({ ...r, serverWait: byKey.get(`${r.method} ${r.url}`)?.shift() ?? null }));
}

/**
 * Run `mantis perf`.
 * @param {import('../options.js').PerfOptions} opts
 * @param {{log?: (line: string) => void}} [io]
 */
export async function perf(opts, { log = () => {} } = {}) {
  const startedAt = new Date();
  const profile = PERF_PROFILES[opts.profile];
  const session = opts.storageState ? await readStorageState(opts.storageState) : null;
  const browser = await launchBrowser();
  try {
    await preflight(browser, new URL(opts.routes[0], opts.baseUrl).href, session);
    const routes = [];
    for (const route of opts.routes) {
      const url = new URL(route, opts.baseUrl).href;
      const visits = [];
      const notes = [];
      for (let i = 0; i < opts.runs; i++) {
        try {
          const v = await measureVisit(browser, url, profile, { storageState: session, timeout: opts.timeout });
          visits.push(v);
          log(`[${route} ${i + 1}/${opts.runs}] LCP ${fmtMs(v.metrics.lcp)} · TBT ${fmtMs(v.metrics.tbt)} · CLS ${v.metrics.cls} · ${fmtKb(v.metrics.bytes)}`);
        } catch (err) {
          notes.push(`visit ${i + 1} failed: ${firstLine(err.message)}`);
          log(`[${route} ${i + 1}/${opts.runs}] failed: ${firstLine(err.message)}`);
        }
      }
      let trace = { requests: [], coverage: [], hotFunctions: [] };
      try {
        trace = await measureTrace(browser, url, profile, { storageState: session, timeout: opts.timeout });
      } catch (err) {
        notes.push(`unthrottled trace visit failed: ${firstLine(err.message)}`);
      }
      if (!visits.length) {
        routes.push({ route, url, status: 'failed', notes });
        continue;
      }
      const metrics = aggregate(visits);
      const rep = visits[representative(visits, metrics)];
      if (rep.devSigns.length) notes.unshift(`Measured a development server (${rep.devSigns.join(', ')}): its numbers are not what users get. Measure a production build (npm run build && npm run preview, next start…).`);
      routes.push({
        route,
        url,
        status: rep.status && rep.status >= 400 ? 'failed' : 'ok',
        metrics,
        framework: rep.framework,
        devServer: rep.devSigns.length > 0,
        visit: { ...rep, requests: attachServerWait(rep.requests, trace.requests), coverage: trace.coverage, hotFunctions: trace.hotFunctions },
        notes,
      });
    }
    const report = {
      tool: 'mantis',
      kind: 'perf',
      version: VERSION,
      runId: null,
      url: opts.url,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      profile: { name: profile.name, label: profile.label },
      runs: opts.runs,
      routes,
    };
    const outDir = path.resolve(opts.out);
    await ensureOutDir(outDir);
    const runDir = await uniqueDir(path.join(outDir, 'perf', 'runs'), runIdFor(startedAt));
    report.runId = path.basename(runDir);
    await writeFile(path.join(runDir, 'perf.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(path.join(runDir, 'perf.md'), renderPerfMarkdown(report));
    const latestDir = path.join(outDir, 'perf', 'latest');
    await rm(latestDir, { recursive: true, force: true });
    await mkdir(path.dirname(latestDir), { recursive: true });
    await cp(runDir, latestDir, { recursive: true });
    const failed = routes.some((r) => r.status === 'failed');
    return { report, runDir, latestDir, exitCode: failed ? 2 : 0 };
  } finally {
    await browser.close().catch(() => {});
  }
}

export const fmtMs = (ms) => (ms == null ? '–' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
export const fmtKb = (b) => (b == null ? '–' : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);
const RATING = { good: 'good', 'needs-improvement': 'needs improvement', poor: '**poor**' };
const LABEL = { lcp: 'LCP', fcp: 'FCP', tbt: 'TBT', cls: 'CLS', ttfb: 'TTFB', load: 'load', bytes: 'transferred', requests: 'requests' };
const fmt = (m, v) => (m === 'cls' ? String(v) : m === 'bytes' ? fmtKb(v) : m === 'requests' ? String(v) : fmtMs(v));

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

/** @param {object} report */
export function renderPerfMarkdown(report) {
  const lines = ['# Mantis perf report', ''];
  lines.push(`\`${report.url}\` · ${report.profile.label} · median of ${report.runs} cold visit${report.runs === 1 ? '' : 's'} per route · ${(report.durationMs / 1000).toFixed(0)}s`, '');
  lines.push('INP needs real interactions, which a lab run does not have: TBT and the long animation frames below stand in for responsiveness.', '');
  for (const r of report.routes) {
    lines.push(`## \`${r.route}\``, '');
    for (const n of r.notes ?? []) lines.push(`> ${n}`, '');
    if (r.status === 'failed' && !r.metrics) continue;
    const origin = new URL(r.url).origin;
    lines.push('| metric | median | range | rating |', '|---|---|---|---|');
    for (const m of METRICS) {
      const s = r.metrics[m];
      if (!s) continue;
      lines.push(`| ${LABEL[m]} | ${fmt(m, s.median)} | ${fmt(m, s.min)} – ${fmt(m, s.max)} | ${s.rating ? RATING[s.rating] : ''} |`);
    }
    lines.push('');
    const v = r.visit;
    if (v.lcpElement) {
      const e = v.lcpElement;
      lines.push(`**LCP element:** \`${e.selector}\` (${e.tag}${e.url ? `, ${shortUrl(e.url, origin)}` : e.text ? `, "${e.text}"` : ''})${r.framework ? ` · framework: ${r.framework}` : ''}`, '');
    }
    const slow = [...v.requests].filter((q) => q.duration != null).sort((a, b) => b.duration - a.duration).slice(0, 8);
    if (slow.length) {
      lines.push('**Slowest requests** (server wait from the unthrottled visit)', '', '| request | type | start → end | server wait | size | called from |', '|---|---|---|---|---|---|');
      for (const q of slow) {
        const from = q.initiator?.fn || q.initiator?.url ? `${q.initiator.fn ? `\`${q.initiator.fn}\` ` : ''}${q.initiator.url ? shortUrl(q.initiator.url, origin) : ''}${q.initiator.line ? `:${q.initiator.line}` : ''}` : q.initiator?.type ?? '';
        lines.push(`| ${shortUrl(q.url, origin)} | ${q.type} | ${fmtMs(q.start)} → ${fmtMs(q.end)} | ${fmtMs(q.serverWait)} | ${fmtKb(q.bytes)} | ${from} |`);
      }
      lines.push('');
    }
    if (v.hotFunctions?.length) {
      const slower = PERF_PROFILES[report.profile.name]?.cpuSlowdown ?? 1;
      lines.push(`**Hot functions** (main-thread self time, unthrottled${slower > 1 ? `: about ${slower}× longer on this profile's CPU` : ''})`, '');
      for (const f of v.hotFunctions.slice(0, 6)) lines.push(`- \`${f.fn}\` ${shortUrl(f.url, origin)}:${f.line}: ${fmtMs(f.self)}`);
      lines.push('');
    }
    const frames = [...v.loafs].sort((a, b) => b.blocking - a.blocking).slice(0, 5);
    if (frames.length) {
      lines.push('**Long animation frames**', '');
      for (const f of frames) {
        const scripts = f.scripts.filter((s) => s.duration >= 5).sort((a, b) => b.duration - a.duration).slice(0, 3)
          .map((s) => `${s.fn ? `\`${s.fn}\` in ` : /-script$/.test(s.invokerType) ? 'script ' : `${s.invoker} in `}${shortUrl(s.url, origin)} (${fmtMs(s.duration)})`).join('; ');
        lines.push(`- ${fmtMs(f.duration)} at ${fmtMs(f.t)}, ${fmtMs(f.blocking)} blocking${scripts ? `: ${scripts}` : ''}`);
      }
      lines.push('');
    }
    const unused = [...(v.coverage ?? [])].filter((c) => c.unused > 10 * 1024).sort((a, b) => b.unused - a.unused).slice(0, 5);
    if (unused.length) {
      lines.push('**Unused code** (unthrottled coverage visit)', '');
      for (const c of unused) lines.push(`- ${shortUrl(c.url, origin)} (${c.type}): ${fmtKb(c.unused)} of ${fmtKb(c.total)} never ran`);
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}
