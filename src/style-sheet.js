import path from 'node:path';
import { parseHex } from './color.js';
import { renderHtmlToPng } from './contact-sheet.js';
import { formatLocalTime } from './report.js';
import { BASE_CSS, MOON, SUN, brandStyle, escapeHtml, footerHtml, headerHtml, plural, roundStamp, scribbleHtml, statCard } from './sheet-style.js';

const MAX_SWATCHES = 28;
const EASINGS = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

const px = (v) => (typeof v === 'number' ? `${v}px` : String(v));
const numAsc = (a, b) => (typeof a.value === 'number' ? a.value : 1e9) - (typeof b.value === 'number' ? b.value : 1e9);
const fill = (hex) => {
  const c = parseHex(hex);
  return c && c[3] < 1
    ? `background:linear-gradient(${hex},${hex}),repeating-conic-gradient(#d9d1c3 0 25%,#fff 0 50%) 0 0/12px 12px`
    : `background:${hex}`;
};
const token = (e) => (e?.tokens?.length ? `<span class="tok">${escapeHtml(e.tokens[0])}</span>` : '');

function swatch(e) {
  const roles = e.roles || {};
  const tags = [['text', 'text'], ['bg', 'fill'], ['border', 'line']].filter(([r]) => roles[r]).map(([, t]) => `<i>${t}</i>`).join('');
  return `<div class="sw"><div class="chip" style="${fill(e.value)}"></div><b>${escapeHtml(e.value)}</b>${token(e)}<em>&times;${e.uses}${tags}</em></div>`;
}

function paletteCard(style, scheme) {
  const colors = style.colors[scheme] || [];
  const shown = colors.slice(0, MAX_SWATCHES);
  const more = colors.length > shown.length ? `<p class="more">+ ${colors.length - shown.length} more, used less often (style.md lists them all)</p>` : '';
  return `<section class="card wide ${scheme === 'dark' ? 'night' : ''}"><h2>${scheme === 'dark' ? MOON : SUN}Palette · ${scheme}<small>${plural(colors.length, 'color')}, most used first</small></h2>
<div class="sws">${shown.map(swatch).join('')}</div>${more}</section>`;
}

function typeCard(style) {
  const family = style.fontFamily?.[0]?.value;
  const sizes = (style.fontSize || []).slice(0, 9).sort((a, b) => b.value - a.value);
  const rows = sizes.map((e) => {
    const sample = e.examples?.find((x) => x.text)?.text || 'Aa Bb Cc 0123';
    return `<div class="ty"><span class="px">${px(e.value)}</span><span class="sample" style="font-size:${Math.min(e.value, 54)}px${family ? `;font-family:'${escapeHtml(family)}',Inter,sans-serif` : ''}">${escapeHtml(sample.slice(0, 34))}</span><span class="meta">${token(e)}&times;${e.uses}</span></div>`;
  });
  const fonts = (style.fontFamily || []).slice(0, 5).map((e) => `<span class="pill">${escapeHtml(e.value)} <em>&times;${e.uses}</em></span>`).join('');
  const weights = (style.fontWeight || []).slice().sort(numAsc).slice(0, 7)
    .map((e) => `<span class="pill" style="font-weight:${e.value}">${e.value} <em>&times;${e.uses}</em></span>`).join('');
  return `<section class="card span2"><h2>Type scale<small>${plural(style.fontSize?.length ?? 0, 'size')} · the app's own text at each size</small></h2>
${rows.join('') || '<p class="none">No text measured.</p>'}<div class="pills">${fonts}</div><div class="pills">${weights}</div></section>`;
}

function cornersCard(style) {
  const radii = (style.radius || []).slice(0, 8).sort(numAsc);
  const boxes = radii.map((e) => `<div class="rad"><div class="box" style="border-radius:${e.value === 'full' ? '999px' : typeof e.value === 'number' ? `${Math.min(e.value, 36)}px` : e.value}"></div><b>${escapeHtml(px(e.value))}</b>${token(e)}<em>&times;${e.uses}</em></div>`);
  return `<section class="card"><h2>Corners<small>${style.radius?.length ?? 0} ${style.radius?.length === 1 ? 'radius' : 'radii'}</small></h2><div class="rads">${boxes.join('') || '<p class="none">No rounded corners.</p>'}</div></section>`;
}

function spacingCard(style) {
  const values = (style.spacing || []).slice(0, 12).sort(numAsc);
  const max = Math.max(1, ...values.map((e) => e.value));
  const rows = values.map((e) => `<div class="sp"><b>${px(e.value)}</b><span class="bar" style="width:${Math.max(3, Math.round((e.value / max) * 230))}px"></span><em>&times;${e.uses}</em>${token(e)}</div>`);
  return `<section class="card"><h2>Spacing<small>padding and gaps, the 12 most used</small></h2>${rows.join('') || '<p class="none">No padding or gaps.</p>'}</section>`;
}

function curve(easing) {
  const m = /cubic-bezier\(([^)]+)\)/.exec(easing);
  const p = m ? m[1].split(',').map(Number) : EASINGS[easing];
  if (!p || p.some((n) => !Number.isFinite(n))) return `<div class="curve none">${escapeHtml(easing.slice(0, 14))}</div>`;
  const S = 64;
  const X = (v) => (4 + v * (S - 8)).toFixed(1);
  const Y = (v) => (S - 4 - v * (S - 8)).toFixed(1);
  return `<svg class="curve" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><rect x="0.5" y="0.5" width="${S - 1}" height="${S - 1}" rx="8"/><path d="M${X(0)} ${Y(0)} C${X(p[0])} ${Y(p[1])} ${X(p[2])} ${Y(p[3])} ${X(1)} ${Y(1)}"/></svg>`;
}

function motionCard(style) {
  const durations = (style.duration || []).slice(0, 6).sort(numAsc);
  const easings = (style.easing || []).slice(0, 4);
  if (!durations.length) return '<section class="card"><h2>Motion</h2><p class="none">No transitions or animations on these screens.</p></section>';
  return `<section class="card"><h2>Motion<small>transition and animation timing</small></h2>
<div class="pills">${durations.map((e) => `<span class="pill">${e.value}ms <em>&times;${e.uses}</em></span>`).join('')}</div>
<div class="curves">${easings.map((e) => `<div class="ease">${curve(e.value)}<em>&times;${e.uses}</em></div>`).join('')}</div></section>`;
}

function driftCard(style) {
  const items = style.drift.slice(0, 6);
  if (!items.length) {
    return `<section class="card"><h2>Near-duplicates</h2><p class="clean">None. Every rarely used value is clearly different from the common ones.</p></section>`;
  }
  const rows = items.map((d, i) => {
    const ring = i === 0 ? scribbleHtml({ x: 0, y: 0, width: 44, height: 44 }, 44, 44, '') : '';
    let pair;
    if (d.kind === 'color') pair = `<div class="dchip" style="${fill(d.value)}">${ring}</div><span class="approx">&asymp;</span><div class="dchip" style="${fill(d.near)}"></div>`;
    else pair = `<div class="dval">${escapeHtml(px(d.value))}${ring}</div><span class="approx">&asymp;</span><div class="dval main">${escapeHtml(px(d.near))}</div>`;
    const where = d.examples?.[0]?.sel ? `<code>${escapeHtml(d.examples[0].sel.slice(0, 44))}</code>` : '';
    const dist = d.kind === 'color' ? `&Delta;E ${d.distance}` : `${d.distance}px apart`;
    return `<div class="drift">${pair}<div class="dtext"><span class="l1"><b>${escapeHtml(px(d.value))}</b> &times;${d.uses} ${where}</span><span>vs <b>${escapeHtml(px(d.near))}</b> ${d.nearTokens?.[0] ? `<span class="tok">${escapeHtml(d.nearTokens[0])}</span> ` : ''}&times;${d.nearUses} · ${dist}${d.scheme ? ` · ${d.scheme}` : ''}</span></div></div>`;
  });
  const more = style.drift.length > items.length ? `<p class="more">+ ${style.drift.length - items.length} more in style.md</p>` : '';
  return `<section class="card driftcard"><h2>Near-duplicates<small>rare values a hair away from a house value</small></h2>${rows.join('')}${more}</section>`;
}

/** HTML of the house-style sheet (`style.png`). */
export function styleSheetHtml(style, project = null) {
  const light = style.colors[style.schemes[0]]?.length ?? 0;
  const counts = style.schemes.map((s, i) => `<strong>${style.colors[s]?.length ?? 0}</strong> ${i === 0 ? 'colors in' : 'in'} ${s}`).join(' and ');
  const summary = `${counts}, <strong>${style.fontSize?.length ?? 0}</strong> font sizes, <strong>${style.fontFamily?.length ?? 0}</strong> ${style.fontFamily?.length === 1 ? 'font' : 'fonts'} and <strong>${style.radius?.length ?? 0}</strong> corner radii on ${plural(style.screens, 'screen')}. ` +
    (style.drift.length
      ? `<span class="warn"><strong>${plural(style.drift.length, 'near-duplicate')}</strong></span> ${style.drift.length === 1 ? 'looks' : 'look'} like hard-coded copies.`
      : '<span class="ok"><strong>No near-duplicates.</strong></span>');
  const stats = [
    statCard(light, 'colors', { note: style.schemes.length > 1 ? `${style.colors[style.schemes[1]]?.length ?? 0} in ${style.schemes[1]}` : style.schemes[0] }),
    statCard(style.fontSize?.length ?? 0, 'type sizes', { note: `${plural(style.fontFamily?.length ?? 0, 'font')}` }),
    statCard(style.drift.length, 'near copies', { tone: style.drift.length ? 'warn' : 'ok', note: style.drift.length ? 'worth a look' : 'clean' }),
  ].join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mantis house style</title><style>${BASE_CSS}
.grid { display:grid; grid-template-columns: repeat(3, minmax(470px, 1fr)); gap:22px; align-items:start; }
.card { padding:22px 24px 24px; background:var(--surface); border:1px solid var(--line); border-radius:14px; box-shadow:0 1px 0 rgba(32,36,31,.04), 0 14px 30px -22px rgba(32,36,31,.5); }
.card.wide { grid-column: 1 / -1; }
.card.span2 { grid-column: span 2; }
.card h2 { display:flex; align-items:center; gap:9px; margin-bottom:18px; font-size:15px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
.card h2 small { margin-left:auto; font-size:13px; font-weight:500; letter-spacing:0; text-transform:none; color:var(--muted); }
.card.night { background:#17191e; border-color:#17191e; color:#eceae4; }
.card.night h2 small, .card.night .sw em, .card.night .tok { color:#a3a59e; }
.card.night .chip { box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
.sws { display:grid; grid-template-columns: repeat(10, 1fr); gap:16px 14px; }
.sw { display:flex; flex-direction:column; gap:3px; min-width:0; }
.chip { height:64px; border-radius:10px; box-shadow: inset 0 0 0 1px rgba(32,36,31,.12); margin-bottom:5px; }
.sw b { font-family:var(--mono); font-size:13px; }
.tok { font-family:var(--mono); font-size:12px; color:var(--brand); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sw em, .rad em, .sp em, .ease em { font-style:normal; font-size:12px; color:var(--muted); }
.sw em i { margin-left:5px; padding:0 4px; border:1px solid currentColor; border-radius:3px; font-style:normal; font-size:10px; text-transform:uppercase; letter-spacing:.06em; }
.more, .none, .clean { margin-top:14px; font-size:14px; color:var(--muted); }
.clean { color:var(--ok); font-weight:700; font-size:16px; }
.ty { display:grid; grid-template-columns: 64px 1fr auto; align-items:baseline; gap:16px; padding:7px 0; border-bottom:1px dashed var(--line); }
.ty .px { font-family:var(--mono); font-size:13px; font-weight:700; color:var(--muted); }
.ty .sample { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.15; font-weight:600; }
.ty .meta { display:flex; gap:8px; align-items:baseline; font-size:12px; color:var(--muted); }
.pills { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
.pill { padding:5px 10px; border:1.5px solid var(--ink); border-radius:999px; font-size:13px; font-weight:600; }
.pill em { font-style:normal; color:var(--muted); font-weight:500; }
.rads { display:grid; grid-template-columns: repeat(4, 1fr); gap:16px 10px; }
.rad { display:flex; flex-direction:column; gap:2px; align-items:flex-start; }
.rad .box { width:72px; height:72px; margin-bottom:6px; border:2.5px solid var(--ink); background:linear-gradient(135deg, color-mix(in srgb, var(--brand) 22%, #fff), #fff); }
.rad b { font-family:var(--mono); font-size:13px; }
.sp { display:grid; grid-template-columns: 56px auto auto 1fr; align-items:center; gap:10px; padding:4px 0; }
.sp b { font-family:var(--mono); font-size:13px; }
.sp .bar { height:12px; border-radius:3px; background:var(--brand); }
.curves { display:flex; gap:14px; margin-top:16px; }
.ease { display:flex; flex-direction:column; align-items:center; gap:4px; }
.curve rect { fill:#fbf8f1; stroke:var(--line); }
.curve path { fill:none; stroke:var(--brand); stroke-width:3; stroke-linecap:round; }
.curve.none { font-size:11px; color:var(--muted); }
.drift { display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px dashed var(--line); }
.dchip, .dval { position:relative; flex:none; min-width:44px; height:44px; border-radius:8px; box-shadow: inset 0 0 0 1px rgba(32,36,31,.15); }
.dval { display:flex; align-items:center; justify-content:center; padding:0 6px; font-family:var(--mono); font-size:12px; font-weight:800; background:#fbf8f1; }
.dval.main { background:var(--ok-soft); }
.approx { font-size:22px; color:var(--muted); }
.dtext { display:flex; flex-direction:column; gap:3px; margin-left:18px; font-size:14px; min-width:0; }
.dtext b { font-family:var(--mono); }
.dtext code { margin-left:6px; font-family:var(--mono); font-size:12px; color:var(--muted); }
.dtext > span + span { color:var(--muted); }
.driftcard .note { font-size:10px; }
</style></head><body${brandStyle(project)}>
${headerHtml({
    project,
    url: style.url,
    title: 'House style',
    round: roundStamp(0, 'Learn'),
    summary,
    meta: `${escapeHtml(style.url)} · ${escapeHtml(formatLocalTime(style.learnedAt))} · ${plural(style.screens, 'screen')} · ${style.elements} elements`,
    stats,
  })}
<div class="grid">
${style.schemes.map((s) => paletteCard(style, s)).join('\n')}
${typeCard(style)}
${cornersCard(style)}
${spacingCard(style)}
${motionCard(style)}
${driftCard(style)}
</div>
${footerHtml(`learned by mantis ${escapeHtml(style.version)} · ${escapeHtml(style.viewports.join(', '))}`)}
</body></html>`;
}

/** Write the house-style sheet to `outPng`. */
export async function renderStyleSheet(browser, style, project, outPng) {
  await renderHtmlToPng(browser, styleSheetHtml(style, project), path.join(path.dirname(outPng), '.style-sheet.html'), outPng);
  return outPng;
}
