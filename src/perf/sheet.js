/**
 * The perf sheet (`perf-sheet.png`), in the same field-notes look as the other sheets: the metrics
 * rated against Core Web Vitals, a filmstrip of the first route with the first paint and the LCP
 * frame marked, a waterfall of the requests that matter, the first fixes to make, and what each
 * third party costs.
 */
import path from 'node:path';
import { renderHtmlToPng } from '../contact-sheet.js';
import { formatLocalTime } from '../report.js';
import { BASE_CSS, brandStyle, escapeHtml, footerHtml, headerHtml, plural, roundStamp, statCard } from '../sheet-style.js';
import { savingLabel } from './findings.js';
import { fmtKb, fmtMs, shortUrl } from './metrics.js';

const TONE = { good: 'ok', 'needs-improvement': 'warn', poor: 'err' };
const RATING = { good: 'good', 'needs-improvement': 'needs work', poor: 'poor' };
const KIND = { Document: 'doc', Stylesheet: 'css', Script: 'js', Image: 'img', Font: 'font', Fetch: 'api', XHR: 'api' };

function metricCard(label, s, fmt) {
  if (!s) return '';
  const spread = s.min !== s.max ? `${fmt(s.min)} – ${fmt(s.max)}` : s.values.length > 1 ? `same in ${s.values.length} runs` : 'one run';
  return statCard(escapeHtml(fmt(s.median)), label, { tone: TONE[s.rating] ?? '', note: `${s.rating ? `${RATING[s.rating]} · ` : ''}${spread}` });
}

/** Frames at even steps up to the last visual change, the first paint and LCP marked. */
export function pickFrames(frames, { fcp, lcp, count = 8 }) {
  if (!frames?.length) return [];
  const end = Math.max(lcp ?? 0, frames[frames.length - 1].t);
  const at = (t) => [...frames].reverse().find((f) => f.t <= t) ?? null;
  const times = Array.from({ length: count }, (_, i) => Math.round((end * (i + 1)) / count));
  const marks = [fcp, lcp].filter((t) => t != null);
  const taken = new Set();
  for (const m of marks) {
    // the nearest step another mark hasn't taken, so close marks get a frame each
    let near = -1;
    times.forEach((t, i) => {
      if (!taken.has(i) && (near < 0 || Math.abs(t - m) < Math.abs(times[near] - m))) near = i;
    });
    if (near < 0) continue;
    times[near] = Math.round(m);
    taken.add(near);
  }
  return [...new Set(times)].sort((a, b) => a - b).map((t) => ({ t, frame: at(t), fcp: fcp != null && Math.abs(t - fcp) < 1, lcp: lcp != null && Math.abs(t - lcp) < 1 }));
}

function filmstripHtml(route) {
  const picks = route.visit.filmstrip ?? [];
  if (!picks.length) return '';
  const cells = picks.map((p) => {
    const img = p.file ? `<img src="${escapeHtml(p.file)}" alt="">` : '<div class="blank"></div>';
    const tag = p.lcp ? '<b class="tag lcp">LCP</b>' : p.fcp ? '<b class="tag fcp">first paint</b>' : '';
    return `<figure class="${p.lcp ? 'is-lcp' : ''}">${img}<figcaption>${fmtMs(p.t)}${tag}</figcaption></figure>`;
  }).join('');
  return `<section class="card wide"><h2>What the visitor sees<small>${escapeHtml(route.route)} · one cold visit</small></h2><div class="film">${cells}</div></section>`;
}

/**
 * The requests that matter, as bars on a shared time axis with the first paint and LCP marked: the
 * HTML, what blocks the first paint, the LCP image, API calls, big scripts and the first 3 fonts.
 */
export function waterfallRows(v, origin, max = 14) {
  const lcpUrl = v.lcpElement?.url;
  const fonts = new Set(v.requests.filter((q) => q.type === 'Font' && q.end != null).sort((a, b) => a.start - b.start).slice(0, 3));
  const keep = v.requests.filter((q) => q.end != null && (q.type === 'Document' || q.renderBlocking || q.url === lcpUrl || q.type === 'Fetch' || q.type === 'XHR' || fonts.has(q) || (q.type === 'Script' && (q.bytes ?? 0) > 10 * 1024)));
  return keep.sort((a, b) => a.start - b.start).slice(0, max).map((q) => ({
    label: shortUrl(q.url, origin),
    kind: q.url === lcpUrl ? 'lcp' : q.renderBlocking ? 'block' : KIND[q.type] ?? 'other',
    start: q.start,
    end: q.end,
    third: new URL(q.url).origin !== origin,
  }));
}

function waterfallHtml(route) {
  const v = route.visit;
  const origin = new URL(route.url).origin;
  const rows = waterfallRows(v, origin);
  if (!rows.length) return '';
  const end = Math.max(...rows.map((r) => r.end), v.lcp ?? 0) * 1.04;
  const pct = (t) => `${((t / end) * 100).toFixed(2)}%`;
  // Labels of marks close together go on two lines.
  const close = v.fcp != null && v.lcp != null && Math.abs(v.lcp - v.fcp) / end < 0.15;
  const lines = [v.fcp != null && `<i class="mark fcp" style="left:${pct(v.fcp)}"><span>first paint ${fmtMs(v.fcp)}</span></i>`, v.lcp != null && `<i class="mark lcp" style="left:${pct(v.lcp)}"><span${close ? ' class="low"' : ''}>LCP ${fmtMs(v.lcp)}</span></i>`].filter(Boolean).join('');
  const body = rows.map((r) => `<div class="wrow"><span class="wl${r.third ? ' third' : ''}">${escapeHtml(r.label)}</span><span class="wt"><b class="bar ${r.kind}" style="left:${pct(r.start)};width:max(3px, ${pct(r.end - r.start)})"></b><em style="left:calc(${pct(r.end)} + 6px)">${fmtMs(r.end - r.start)}</em></span></div>`).join('');
  const legend = [['block', 'holds first paint'], ['lcp', 'LCP image'], ['api', 'API'], ['js', 'script'], ['font', 'font'], ['doc', 'HTML']].map(([k, t]) => `<span><b class="bar ${k}"></b>${t}</span>`).join('');
  return `<section class="card span2"><h2>Waterfall<small>${legend}</small></h2><div class="wf${close ? ' two' : ''}"><div class="wlines">${lines}</div>${body}</div></section>`;
}

function fixesHtml(findings, origin) {
  const top = findings.filter((f) => f.bucket === 'do-first' || f.bucket === 'plan').slice(0, 5);
  if (!top.length) return `<section class="card"><h2>Fix first</h2><p class="clean">Nothing to do first or to plan.</p></section>`;
  const items = top.map((f, i) => {
    const c = f.culprit;
    const where = c.fn ? `${c.fn} · ${shortUrl(c.url, origin)}${c.line ? `:${c.line}${c.column ? `:${c.column}` : ''}` : ''}` : c.selector ?? (c.url ? shortUrl(c.url, origin) : '');
    return `<li><span class="num">${i + 1}</span><div><b>${escapeHtml(f.title.replace(/`/g, ''))}</b><code>${escapeHtml(where)}</code></div><span class="save ${f.bucket}">${escapeHtml(savingLabel(f))}<small>${f.bucket === 'do-first' ? 'do first' : 'plan'} · risk ${f.fixRisk}</small></span></li>`;
  }).join('');
  return `<section class="card"><h2>Fix first<small>impact × fix risk</small></h2><ol class="fixes">${items}</ol></section>`;
}

function vendorsHtml(findings) {
  const vendors = findings.filter((f) => f.category === 'third-party' && f.vendor).map((f) => f.vendor);
  if (!vendors.length) return '';
  const top = Math.max(...vendors.map((x) => x.mainThreadMs), 1);
  const rows = vendors.sort((a, b) => b.mainThreadMs - a.mainThreadMs).slice(0, 6).map((x) => `<div class="vrow"><span class="vn"><b>${escapeHtml(x.name)}</b><em>${escapeHtml(x.category === 'other' ? 'third party' : x.category)}</em></span><span class="vb"><b style="width:${((x.mainThreadMs / top) * 100).toFixed(1)}%"></b></span><span class="vv">${fmtMs(x.mainThreadMs)}<em>${fmtKb(x.bytes)}</em></span></div>`).join('');
  return `<section class="card"><h2>Third parties<small>main thread on this profile</small></h2>${rows}</section>`;
}

/** HTML of the perf sheet, written next to the filmstrip frames it shows (`filmstrip/*.jpg`). */
export function perfSheetHtml(report, project = null) {
  const route = report.routes.find((r) => r.metrics) ?? null;
  const origin = new URL(report.url).origin;
  const s = report.summary;
  const todo = s['do-first'] + s.plan;
  const coverUps = report.baseline?.coverUps.length ?? 0;
  const summary = coverUps
    ? `<span class="err"><strong>Faster, or just emptier?</strong></span> ${escapeHtml(report.baseline.coverUps[0].reasons[0])}.`
    : todo
      ? `<strong>${plural(todo, 'fix')}</strong> worth making: <strong>${s['do-first']}</strong> to do first, <strong>${s.plan}</strong> to plan${s['your-call'] ? `, and <span class="warn"><strong>${s['your-call']}</strong></span> for you to decide` : ''}.`
      : '<span class="ok"><strong>Nothing to do first or to plan.</strong></span>';
  const m = route?.metrics ?? {};
  const stats = [
    metricCard('LCP', m.lcp, fmtMs),
    metricCard('TBT', m.tbt, fmtMs),
    metricCard('CLS', m.cls, (x) => String(x)),
  ].join('');
  const receipt = report.baseline ? `<p class="receipt">vs ${escapeHtml(report.baseline.runId)}: ${escapeHtml(report.baseline.receipt)}</p>` : '';
  const more = route ? [
    metricCard('FCP', m.fcp, fmtMs),
    metricCard('TTFB', m.ttfb, fmtMs),
    metricCard('API data in', m.data, fmtMs),
    metricCard('transferred', m.bytes, fmtKb),
  ].join('') : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mantis perf</title><style>${BASE_CSS}
.grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:22px; align-items:start; width:1730px; }
.stack { display:flex; flex-direction:column; gap:22px; }
.card { padding:22px 24px 24px; background:var(--surface); border:1px solid var(--line); border-radius:14px; box-shadow:0 1px 0 rgba(32,36,31,.04), 0 14px 30px -22px rgba(32,36,31,.5); }
.card.wide { grid-column: 1 / -1; } .card.span2 { grid-column: span 2; }
.card h2 { display:flex; align-items:center; gap:9px; margin-bottom:18px; font-size:15px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
.card h2 small { display:flex; gap:14px; margin-left:auto; font-size:13px; font-weight:500; letter-spacing:0; text-transform:none; color:var(--muted); }
.more { display:flex; gap:14px; margin:-18px 0 26px; } .more .stat { min-width:0; flex:1; padding:12px 16px; } .more .stat b { font-size:30px; }
.receipt { margin:-14px 0 26px; font-family:var(--mono); font-size:15px; font-weight:700; }
.film { display:grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap:14px; }
.film figure { display:flex; flex-direction:column; gap:8px; min-width:0; }
.film img, .film .blank { width:100%; aspect-ratio: 1 / 1.6; object-fit:cover; object-position:top; border:1px solid var(--line); border-radius:8px; background:#fff; }
.film figure.is-lcp img { outline:4px solid var(--accent); outline-offset:3px; }
.film figcaption { display:flex; align-items:center; gap:8px; font-family:var(--mono); font-size:14px; font-weight:700; }
.tag { padding:2px 6px; border-radius:4px; font-family:Inter, system-ui, sans-serif; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:#fff; }
.tag.lcp { background:var(--accent); } .tag.fcp { background:var(--ink); }
.wf { position:relative; padding-top:24px; } .wlines { position:absolute; left:260px; right:70px; top:0; bottom:0; pointer-events:none; }
.mark { position:absolute; top:0; bottom:0; border-left:2px dashed var(--ink); } .mark.lcp { border-color:var(--accent); }
.mark span { position:absolute; top:0; left:5px; font-style:normal; font-size:11px; font-weight:800; white-space:nowrap; } .mark.lcp span { color:var(--accent); }
.wf.two { padding-top:38px; } .mark span.low { top:16px; }
.wrow { display:grid; grid-template-columns: 260px 1fr; align-items:center; height:26px; }
.wl { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-right:12px; font-family:var(--mono); font-size:12px; } .wl.third { color:var(--warn); }
.wt { position:relative; height:100%; margin-right:70px; }
.bar { position:absolute; top:7px; height:12px; border-radius:3px; background:#b9b3a5; }
.bar.doc { background:var(--ink); } .bar.block { background:var(--warn); } .bar.lcp { background:var(--accent); } .bar.api { background:#6366f1; } .bar.js { background:#22a3c4; } .bar.img, .bar.font, .bar.css { background:#b9b3a5; }
.wt em { position:absolute; top:5px; font-style:normal; font-family:var(--mono); font-size:11px; color:var(--muted); white-space:nowrap; }
h2 small span { display:inline-flex; align-items:center; gap:5px; } h2 small .bar { position:static; display:inline-block; width:14px; height:10px; }
.fixes { list-style:none; display:flex; flex-direction:column; gap:12px; }
.fixes li { display:grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap:10px; align-items:start; padding-bottom:12px; border-bottom:1px dashed var(--line); }
.fixes .num { display:flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; background:var(--ink); color:#fff; font-size:13px; font-weight:800; }
.fixes b { display:block; font-size:15px; line-height:1.3; overflow-wrap:anywhere; }
.fixes code { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--mono); font-size:12px; color:var(--muted); }
.save { display:flex; flex-direction:column; align-items:flex-end; font-family:var(--mono); font-size:14px; font-weight:800; white-space:nowrap; } .save.do-first { color:var(--ok); } .save.plan { color:var(--warn); }
.save small { font-family:Inter, system-ui, sans-serif; font-size:11px; font-weight:600; color:var(--muted); }
.clean { color:var(--ok); font-weight:700; font-size:16px; }
.vrow { display:grid; grid-template-columns: 190px minmax(0, 1fr) 90px; gap:12px; align-items:center; padding:7px 0; }
.vn { display:flex; flex-direction:column; min-width:0; font-weight:700; font-size:14px; } .vn em, .vv em { font-style:normal; font-weight:500; font-size:12px; color:var(--muted); }
.vn b { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:700; }
.vb { height:14px; border-radius:4px; background:#efe9dd; overflow:hidden; } .vb b { display:block; height:100%; background:var(--warn); }
.vv { display:flex; flex-direction:column; align-items:flex-end; font-family:var(--mono); font-size:14px; font-weight:800; }
</style></head><body${brandStyle(project)}>
${headerHtml({
    project,
    url: report.url,
    title: 'Speed',
    round: roundStamp(3, 'Measure'),
    summary,
    meta: `${escapeHtml(report.url)} · ${escapeHtml(report.profile.label)} · median of ${plural(report.runs, 'cold visit')} · ${escapeHtml(formatLocalTime(report.startedAt))}`,
    stats,
  })}
${receipt}
${more ? `<div class="more">${more}</div>` : ''}
<div class="grid">
${route ? filmstripHtml(route) : ''}
${route ? waterfallHtml(route) : ''}
<div class="stack">${fixesHtml(report.findings, origin)}${vendorsHtml(report.findings)}</div>
</div>
${footerHtml(`measured by mantis ${escapeHtml(report.version)} · INP needs real interactions: TBT stands in`)}
</body></html>`;
}

/** Write `<runDir>/perf-sheet.png`. */
export async function renderPerfSheet(browser, report, runDir, project) {
  const out = path.join(runDir, 'perf-sheet.png');
  await renderHtmlToPng(browser, perfSheetHtml(report, project), path.join(runDir, '.perf-sheet.html'), out);
  return out;
}
