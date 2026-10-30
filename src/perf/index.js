/**
 * `mantis perf`: measure every route with N cold, throttled visits, report the medians with their
 * spread, and keep the representative visit's details (LCP element, long animation frames,
 * requests with initiators, images, coverage) for the findings.
 */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchBrowser, preflight } from '../look.js';
import { readStorageState, storageStateName } from '../options.js';
import { projectInfo } from '../project.js';
import { VERSION, ensureOutDir, firstLine, runIdFor, uniqueDir } from '../util.js';
import { METRIC_NAME, comparePerf, fmtMetric, findPerfBaseline } from './compare.js';
import { BUCKETS, findRouteIssues, rankFindings, savingLabel } from './findings.js';
import { PERF_PROFILES, measureTrace, measureVisit } from './measure.js';
import { fmtKb, fmtMs, median, rating, shortUrl } from './metrics.js';
import { dataReady } from './network.js';
import { pickFrames, renderPerfSheet } from './sheet.js';

export { THRESHOLDS, fmtKb, fmtMs, median, rating, shortUrl } from './metrics.js';

const METRICS = ['lcp', 'fcp', 'tbt', 'cls', 'ttfb', 'data', 'load', 'bytes', 'requests'];

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
 * The visits whose LCP to trust. Chrome now and then reports no LCP entry for a larger image it
 * painted after the last one it reported (measure.js flags it as lcpMissed): those visits are left
 * out of LCP when others have it right, and the report says so either way.
 */
export function lcpVisits(visits) {
  const missed = visits.filter((v) => v.lcpMissed);
  if (!missed.length) return { use: visits, note: null };
  const { selector, loadedAt } = missed[0].lcpMissed;
  const clean = visits.filter((v) => !v.lcpMissed);
  if (clean.length) {
    return { use: clean, note: `Chrome reported no LCP entry for \`${selector}\` in ${missed.length} of ${visits.length} visits, although it painted it after what it reported and it is larger: those visits are left out of LCP.` };
  }
  return { use: visits, note: `Chrome reported no LCP entry for \`${selector}\`, although it loaded at ${fmtMs(loadedAt)} and is larger than what it reported: LCP may be too low here. Measure again.` };
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
  // Found before measuring, so a wrong --baseline fails fast (and `auto` never finds this run).
  const base = await findPerfBaseline({ baseline: opts.baseline, out: opts.out, url: opts.url, profile: opts.profile, storageState: opts.storageState });
  const browser = await launchBrowser();
  try {
    await preflight(browser, new URL(opts.routes[0], opts.baseUrl).href, session);
    const routes = [];
    const frames = new Map();
    for (const route of opts.routes) {
      const url = new URL(route, opts.baseUrl).href;
      const visits = [];
      const notes = [];
      for (let i = 0; i < opts.runs; i++) {
        try {
          const v = await measureVisit(browser, url, profile, { storageState: session, timeout: opts.timeout });
          v.metrics.data = dataReady(v.requests, url);
          visits.push(v);
          log(`[${route} ${i + 1}/${opts.runs}] LCP ${fmtMs(v.metrics.lcp)} · TBT ${fmtMs(v.metrics.tbt)} · CLS ${v.metrics.cls} · ${fmtKb(v.metrics.bytes)}`);
        } catch (err) {
          notes.push(`visit ${i + 1} failed: ${firstLine(err.message)}`);
          log(`[${route} ${i + 1}/${opts.runs}] failed: ${firstLine(err.message)}`);
        }
      }
      let trace = { requests: [], coverage: [], hotFunctions: [], scriptTime: [] };
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
      const trusted = lcpVisits(visits);
      if (trusted.use !== visits) metrics.lcp = aggregate(trusted.use).lcp;
      if (trusted.note) notes.push(trusted.note);
      const rep = trusted.use[representative(trusted.use, metrics)];
      if (rep.devSigns.length) notes.unshift(`Measured a development server (${rep.devSigns.join(', ')}): its numbers are not what users get. Measure a production build (npm run build && npm run preview, next start…).`);
      frames.set(route, pickFrames(rep.filmstrip, { fcp: rep.fcp, lcp: rep.lcp }));
      routes.push({
        route,
        url,
        status: rep.status && rep.status >= 400 ? 'failed' : 'ok',
        metrics,
        framework: rep.framework,
        devServer: rep.devSigns.length > 0,
        visit: { ...rep, filmstrip: [], requests: attachServerWait(rep.requests, trace.requests), coverage: trace.coverage, hotFunctions: trace.hotFunctions, scriptTime: trace.scriptTime },
        notes,
      });
    }
    const findings = rankFindings(routes.filter((r) => r.status === 'ok').map((r) => findRouteIssues(r, profile)));
    const counts = Object.fromEntries(BUCKETS.map((b) => [b.id, findings.filter((f) => f.bucket === b.id).length]));
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
      storageState: storageStateName(opts.storageState),
      runs: opts.runs,
      summary: { findings: findings.length, ...counts },
      baseline: null,
      findings,
      routes,
    };
    const outDir = path.resolve(opts.out);
    if (base) report.baseline = { ...comparePerf(base, report), dir: path.relative(outDir, base.dir) || base.dir };
    await ensureOutDir(outDir);
    const runDir = await uniqueDir(path.join(outDir, 'perf', 'runs'), runIdFor(startedAt));
    report.runId = path.basename(runDir);
    await writeFilmstrips(runDir, routes, frames);
    let sheet = null;
    try {
      sheet = await renderPerfSheet(browser, report, runDir, projectInfo());
    } catch (err) {
      log(`perf sheet failed: ${firstLine(err.message)}`);
    }
    await writeFile(path.join(runDir, 'perf.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(path.join(runDir, 'perf.md'), renderPerfMarkdown(report));
    const latestDir = path.join(outDir, 'perf', 'latest');
    await rm(latestDir, { recursive: true, force: true });
    await mkdir(path.dirname(latestDir), { recursive: true });
    await cp(runDir, latestDir, { recursive: true });
    const failed = routes.some((r) => r.status === 'failed');
    const coverUps = report.baseline?.coverUps.length ?? 0;
    return { report, runDir, latestDir, sheet: sheet && path.join(latestDir, path.basename(sheet)), exitCode: failed ? 2 : counts['do-first'] + counts.plan + coverUps > 0 ? 1 : 0 };
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * Save each route's filmstrip frames as `filmstrip/<route #>-<frame #>.jpg` and keep only their
 * times and files in the report.
 */
async function writeFilmstrips(runDir, routes, frames) {
  const dir = path.join(runDir, 'filmstrip');
  for (const [i, r] of routes.entries()) {
    const picks = frames.get(r.route);
    if (!r.visit || !picks?.length) continue;
    await mkdir(dir, { recursive: true });
    const files = new Map();
    r.visit.filmstrip = [];
    for (const p of picks) {
      let file = null;
      if (p.frame) {
        file = files.get(p.frame);
        if (!file) {
          file = `filmstrip/${i + 1}-${files.size + 1}.jpg`;
          await writeFile(path.join(runDir, file), Buffer.from(p.frame.jpeg, 'base64'));
          files.set(p.frame, file);
        }
      }
      r.visit.filmstrip.push({ t: p.t, file, fcp: p.fcp, lcp: p.lcp });
    }
  }
}

const RATING = { good: 'good', 'needs-improvement': 'needs improvement', poor: '**poor**' };
const FRAMEWORK_NAME = { next: 'Next.js', nuxt: 'Nuxt', sveltekit: 'SvelteKit', angular: 'Angular', vue: 'Vue', react: 'React' };
const LABEL = { lcp: 'LCP', fcp: 'FCP', tbt: 'TBT', cls: 'CLS', ttfb: 'TTFB', data: 'API data in', load: 'load', bytes: 'transferred', requests: 'requests' };
const fmt = (m, v) => (m === 'cls' ? String(v) : m === 'bytes' ? fmtKb(v) : m === 'requests' ? String(v) : fmtMs(v));

/** @param {object} report */
export function renderPerfMarkdown(report) {
  const lines = ['# Mantis perf report', ''];
  lines.push(`\`${report.url}\` · ${report.profile.label} · median of ${report.runs} cold visit${report.runs === 1 ? '' : 's'} per route · ${(report.durationMs / 1000).toFixed(0)}s`, '');
  lines.push('INP needs real interactions, which a lab run does not have: TBT and the long animation frames below stand in for responsiveness.', '');
  const b = report.baseline;
  if (b) {
    lines.push(`## Compared with ${b.runId}`, '', `**${b.receipt}**`, '');
    for (const c of b.coverUps) {
      lines.push(`> **Faster, or just emptier?** \`${c.route}\`: ${c.improved.join(', ')}, but ${c.reasons.join('; ')}. A metric that improves because content is gone is not a fix: put the content back and fix the cause (fine if the content changed on purpose).`, '');
    }
    lines.push('| route | metric | before | after | change |', '|---|---|---|---|---|');
    for (const r of b.routes) {
      for (const [m, d] of Object.entries(r.deltas)) {
        const change = d.significant ? `${d.delta < 0 ? '−' : '+'}${fmtMetric(m, Math.abs(d.delta))} ${d.better ? 'better' : '**worse**'}` : `within noise (±${fmtMetric(m, d.noise)})`;
        lines.push(`| \`${r.route}\` | ${METRIC_NAME[m]} | ${fmtMetric(m, d.before)} | ${fmtMetric(m, d.after)} | ${change} |`);
      }
    }
    lines.push('');
    const list = (title, items) => {
      if (items.length) lines.push(`**${title}**`, '', ...items.map((f) => `- ${f.title}`), '');
    };
    list('Fixed', b.fixed);
    list('Gone with the content (not counted as fixed)', b.goneWithContent);
    list('New', b.new);
  }
  const findings = report.findings ?? [];
  if (findings.length) {
    lines.push('## Fixes, ranked', '');
    lines.push('Savings are estimates for this profile: measure again after each fix.', '');
    const origin = new URL(report.url).origin;
    let n = 0;
    for (const b of BUCKETS) {
      const group = findings.filter((f) => f.bucket === b.id);
      if (!group.length) continue;
      lines.push(`### ${b.title} (${b.blurb})`, '');
      for (const f of group) {
        const c = f.culprit;
        const where = [
          c.selector && `\`${c.selector}\``,
          c.fn && `\`${c.fn}\``,
          c.url && `${shortUrl(c.url, origin)}${c.line ? `:${c.line}${c.column ? `:${c.column}` : ''}` : ''}`,
          c.from && `(loaded from ${shortUrl(c.from, origin)})`,
          c.calledFrom && `(called from ${shortUrl(c.calledFrom, origin)})`,
          c.waitedFor && `(waited for ${shortUrl(c.waitedFor, origin)})`,
        ].filter(Boolean).join(' · ');
        lines.push(`${++n}. **${f.title}** · ${savingLabel(f)} (${f.confidence}) · impact ${f.impact} · fix risk ${f.fixRisk} · ${f.routes.map((r) => `\`${r}\``).join(', ')}`);
        if (where) lines.push(`   - Where: ${where}`);
        lines.push(`   - Why: ${f.evidence}`);
        lines.push(`   - Fix: ${f.fix}`);
        if (f.frameworkFix) lines.push(`   - ${FRAMEWORK_NAME[f.frameworkFix.framework] ?? f.frameworkFix.framework}: ${f.frameworkFix.text}`);
        lines.push(`   - Risk: ${f.riskReason}`);
      }
      lines.push('');
    }
  } else if (report.routes.some((r) => r.metrics)) {
    lines.push('No fixes to suggest: nothing measured here stands out.', '');
  }
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
