/**
 * Shared "field notes" look for the contact sheet and the proof sheet (Chromium renders the HTML,
 * then screenshots it): warm paper, ink, white cards around the screenshots, square status badges,
 * a ROUND stamp, the mascot in a 12-channel ring, the project's own name, logo, color and repo.
 */
import { qrSvg } from './qr.js';

export const SPECTRUM = [
  '#ff2d55', '#ff6a3d', '#ffa62b', '#ffd60a', '#a3e635', '#34d399',
  '#22d3ee', '#38bdf8', '#6366f1', '#8b5cf6', '#d946ef', '#f472b6',
];

const MASCOT = new URL('../assets/mantis-128.png', import.meta.url).href;

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const SUN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
export const MOON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z"/></svg>';

const f1 = (n) => n.toFixed(1);

/** The small Mantis mark: a 12-band spectrum disc with an ink pupil. */
export function markSvg(size = 20) {
  const n = SPECTRUM.length;
  const wedges = SPECTRUM.map((c, i) => {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    return `<path d="M22 22 L${f1(22 + 20 * Math.cos(a0))} ${f1(22 + 20 * Math.sin(a0))} A20 20 0 0 1 ${f1(22 + 20 * Math.cos(a1))} ${f1(22 + 20 * Math.sin(a1))} Z" fill="${c}"/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 44 44">${wedges}<circle cx="22" cy="22" r="20" fill="none" stroke="#20241f" stroke-width="2"/><circle cx="22" cy="22" r="8" fill="#20241f"/><circle cx="24" cy="20" r="2.4" fill="#fff"/></svg>`;
}

/** The mascot inside a ring of 12 color ticks (a mantis shrimp sees 12 color channels). */
export function mascotStamp(size = 112) {
  const c = size / 2;
  const r = c - 4;
  const n = SPECTRUM.length;
  const ticks = SPECTRUM.map((col, i) => {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2 + 0.07;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2 - 0.07;
    return `<path d="M${f1(c + r * Math.cos(a0))} ${f1(c + r * Math.sin(a0))} A${r} ${r} 0 0 1 ${f1(c + r * Math.cos(a1))} ${f1(c + r * Math.sin(a1))}" stroke="${col}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  }).join('');
  return `<div class="mascot" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${ticks}<circle cx="${c}" cy="${c}" r="${r - 8}" fill="#fff" stroke="#d9d1c3"/></svg><img src="${escapeHtml(MASCOT)}" alt=""></div>`;
}

/** "ROUND 01 · DETECT": a rubber stamp. */
export const roundStamp = (n, word) => `<span class="round"><b>Round ${String(n).padStart(2, '0')}</b>${escapeHtml(word)}</span>`;

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return String(url ?? '');
  }
}

function initials(name) {
  const words = String(name).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 1)).toUpperCase();
}

/** "MANTIS × <project>" with the project's logo or a monogram in its brand color. */
export function kickerHtml(project, url) {
  const name = project?.name;
  if (!name) return `<div class="kicker">${markSvg(22)}<span>Mantis</span><i>·</i><span>${escapeHtml(hostOf(url))}</span></div>`;
  const logo = project.logo
    ? `<img class="logo" src="${escapeHtml(project.logo)}" alt="">`
    : `<span class="monogram">${escapeHtml(initials(name))}</span>`;
  return `<div class="kicker">${markSvg(22)}<span>Mantis</span><i>&times;</i>${logo}<span>${escapeHtml(name)}</span></div>`;
}

/** A stat card: big number, label, optional note. tone: err | warn | ok | ''. */
export function statCard(value, label, { tone = '', note = '' } = {}) {
  return `<div class="stat ${tone}"><b>${value}</b><span>${escapeHtml(label)}</span>${note ? `<em>${escapeHtml(note)}</em>` : ''}</div>`;
}

/** Arrow pair "14 → 0" with the final number colored by whether anything is left. */
export function arrowValue(before, after, tone) {
  return `<small>${before}</small><i>&rarr;</i><strong class="${tone}">${after}</strong>`;
}

/** QR code to the project's repo with its owner/repo slug, or '' without a repo. */
export function qrCardHtml(project) {
  if (!project?.repo || project.qr === false) return '';
  return `<div class="qr">${qrSvg(project.repo.url, { size: 104 })}<span>${escapeHtml(project.repo.slug)}</span></div>`;
}

/**
 * Page header shared by both sheets.
 * @param {{project?: object, url: string, title: string, round: string, summary: string, meta: string, stats: string}} p
 */
export function headerHtml({ project, url, title, round, summary, meta, stats }) {
  return `<header>
  <div class="who">${mascotStamp(116)}<div class="titles">
    ${kickerHtml(project, url)}
    <h1><span class="uline">${escapeHtml(title)}</span>${round}</h1>
    <p class="summary">${summary}</p>
    <div class="meta">${meta}</div>
  </div></div>
  <div class="side"><div class="totals">${stats}</div>${qrCardHtml(project)}</div>
</header>`;
}

export function footerHtml(right) {
  return `<footer><div class="powered">${markSvg(18)}<b>Powered by Mantis</b><span>sees 12 color channels. you see 3. your agent sees 0.</span></div><div>${right}</div></footer>`;
}

/** `style` attribute for <body>: the project's brand color, when it has one. */
export function brandStyle(project) {
  return project?.brandColor ? ` style="--brand:${escapeHtml(project.brandColor)}"` : '';
}

/**
 * A hand-drawn marker circle around `rect` (thumbnail pixels) with a short note under or above
 * it, inside a box of `w` x `h`. tone: 'err' (found) or 'ok' (fixed). No note when `note` is empty.
 */
export function scribbleHtml(rect, w, h, note, tone = 'err') {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rx = rect.width / 2 + 9;
  const ry = rect.height / 2 + 8;
  const pts = [];
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const t = -2.3 + (Math.PI * 2 * 1.12 * i) / steps;
    const wobble = 1 + 0.04 * Math.sin(3 * t + 1) + 0.025 * Math.sin(5 * t) + 0.07 * (i / steps);
    pts.push(`${f1(cx + rx * wobble * Math.cos(t))} ${f1(cy + ry * wobble * Math.sin(t))}`);
  }
  const below = cy + ry + 30 < h;
  const top = below ? cy + ry * 1.08 + 6 : Math.max(2, cy - ry * 1.08 - 28);
  const left = Math.max(4, Math.min(w - 128, cx - 40));
  return `<svg class="scribble ${tone}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="M${pts.join(' L')}"/></svg>` +
    (note ? `<div class="note ${tone}" style="left:${f1(left)}px;top:${f1(top)}px">${escapeHtml(note)}</div>` : '');
}

/** Issue types worth circling, most telling first. */
const SIGNATURE_TYPES = ['cover-up', 'page-overflow', 'overlap', 'clipped-text', 'theme-leak', 'contrast', 'broken-image', 'tap-target'];

/**
 * The finding to circle: the most telling error-level issue whose outline is visible in its
 * thumbnail, preferring the narrowest viewport and the light scheme.
 * @param {object} report
 * @param {(cell: object, rect: object) => boolean} fits  is `rect` inside the cell's thumbnail
 * @param {(issue: object) => boolean} [accept]
 * @returns {{issue: object, cell: object, rect: object}|null}
 */
export function pickSignature(report, fits, accept = () => true) {
  const rank = (t) => SIGNATURE_TYPES.indexOf(t);
  const issues = report.issues
    .filter((i) => i.severity === 'error' && rank(i.type) >= 0 && accept(i))
    .sort((a, b) => rank(a.type) - rank(b.type) || a.id - b.id);
  for (const issue of issues) {
    const cells = issue.occurrences
      .filter((o) => o.rect)
      .map((o) => ({ o, cell: report.cells.find((c) => c.route === issue.route && c.key === o.cell) }))
      .filter((x) => x.cell && x.cell.screenshot)
      .sort((a, b) => a.cell.width - b.cell.width || (a.cell.scheme === 'light' ? -1 : 1));
    for (const { o, cell } of cells) {
      if (fits(cell, o.rect)) return { issue, cell, rect: o.rect };
    }
  }
  return null;
}

/**
 * Where a document rect lands in a `w` x `h` thumbnail that shows the cell's screenshot at full
 * width, or null when a circle there would not read well: cut off, under the badges, too large,
 * or a thumbnail too narrow for the note. Screenshots are as wide as the page, which is wider
 * than the viewport when the page overflows.
 */
export function thumbRect(cell, rect, w, h) {
  if (w < 140) return null;
  const s = w / (cell.shotWidth || cell.width);
  const r = { x: rect.x * s, y: rect.y * s, width: rect.width * s, height: rect.height * s };
  if (r.y < 36 || r.y + r.height > h - 12 || r.x < 0 || r.x + r.width > w) return null;
  if (r.width > 0.8 * w || r.width * r.height > 0.4 * w * h) return null;
  return r;
}

/** Plural helper: plural(3, 'error') -> "3 errors". */
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const BASE_CSS = `
:root { --bg:#f7f3ea; --dot:#e6ddcc; --surface:#ffffff; --ink:#20241f; --muted:#686b63; --line:#d9d1c3;
  --accent:#e74a36; --brand:var(--accent); --err:#c52e3f; --warn:#875000; --ok:#26774a;
  --err-soft:#f9e4e4; --warn-soft:#f6ecd9; --ok-soft:#e2f1e7; --mono:"JetBrains Mono","SFMono-Regular",Menlo,Consolas,"DejaVu Sans Mono",monospace; }
* { box-sizing:border-box; margin:0; padding:0; }
html { background:var(--bg); }
body { position:relative; width:max-content; min-width:1100px; padding:58px 56px 40px; color:var(--ink);
  background-color:var(--bg); background-image:radial-gradient(var(--dot) 1.1px, transparent 1.3px); background-size:24px 24px; background-position:12px 12px;
  font-family: Inter, "Inter Display", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Liberation Sans", sans-serif;
  font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
body::before { content:""; position:absolute; left:0; right:0; top:0; height:8px; background:var(--brand); }
header { display:flex; align-items:center; justify-content:space-between; gap:56px; margin-bottom:40px; }
.who { display:flex; align-items:center; gap:26px; }
.mascot { position:relative; flex:none; }
.mascot svg { position:absolute; inset:0; }
.mascot img { position:absolute; left:16%; top:14%; width:68%; height:68%; object-fit:contain; }
.kicker { display:flex; align-items:center; gap:9px; font-size:15px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); }
.kicker i { font-style:normal; color:var(--accent); font-weight:700; letter-spacing:0; }
.kicker span:last-child { color:var(--ink); }
.kicker .logo { height:26px; max-width:120px; object-fit:contain; }
.monogram { display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:7px; background:var(--brand); color:#fff; font-size:13px; letter-spacing:.02em; }
h1 { display:flex; align-items:center; gap:22px; margin-top:12px; font-size:50px; font-weight:800; letter-spacing:-0.035em; line-height:1.05; }
.uline { padding-bottom:9px; background:linear-gradient(90deg, ${SPECTRUM.map((c, i) => `${c} ${((i * 100) / SPECTRUM.length).toFixed(2)}% ${(((i + 1) * 100) / SPECTRUM.length).toFixed(2)}%`).join(', ')}) no-repeat 0 100% / 100% 6px; }
.round { display:inline-flex; flex-direction:column; align-items:center; padding:6px 14px 7px; transform:rotate(-6deg); border:3px double var(--accent); border-radius:8px; color:var(--accent); font-size:15px; font-weight:800; letter-spacing:.2em; text-transform:uppercase; line-height:1.15; background:rgba(255,255,255,.55); }
.round b { font-size:12px; letter-spacing:.24em; }
.summary { margin-top:14px; max-width:860px; font-size:21px; line-height:1.45; color:var(--ink); }
.summary strong { font-weight:800; }
.summary .err { color:var(--err); } .summary .ok { color:var(--ok); } .summary .warn { color:var(--warn); }
.meta { margin-top:10px; font-family:var(--mono); font-size:14px; color:var(--muted); }
.side { display:flex; align-items:stretch; gap:14px; }
.totals { display:flex; gap:14px; }
.stat { display:flex; flex-direction:column; justify-content:center; min-width:150px; padding:16px 20px; background:var(--surface); border:1px solid var(--line); border-radius:12px; box-shadow:0 1px 0 rgba(32,36,31,.04), 0 10px 24px -18px rgba(32,36,31,.45); }
.stat b { display:flex; align-items:baseline; gap:8px; font-size:48px; font-weight:800; letter-spacing:-0.03em; line-height:1; }
.stat b small { font-size:30px; color:var(--muted); font-weight:700; }
.stat b i { font-style:normal; font-size:26px; color:var(--muted); font-weight:600; }
.stat span { margin-top:8px; font-size:13px; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:.14em; }
.stat em { margin-top:3px; font-style:normal; font-size:13px; color:var(--muted); }
.stat b strong { font-weight:800; }
.stat.err b, .stat b .err { color:var(--err); } .stat.warn b, .stat b .warn { color:var(--warn); } .stat.ok b, .stat b .ok { color:var(--ok); }
.qr { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:12px 14px 10px; background:var(--surface); border:1px solid var(--line); border-radius:12px; }
.qr svg { display:block; }
.qr span { font-family:var(--mono); font-size:12px; color:var(--muted); max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.colhead { display:flex; flex-direction:column; gap:4px; color:var(--ink); font-size:13px; font-weight:800; text-transform:uppercase; letter-spacing:.14em; }
.colhead .ch1 { display:flex; align-items:center; gap:7px; }
.colhead em { font-style:normal; font-weight:500; color:var(--muted); letter-spacing:0; text-transform:none; white-space:nowrap; font-size:13px; }
.rowhead { padding-top:4px; border-top:2px solid var(--ink); }
.route { margin-top:10px; font-family:var(--mono); font-size:17px; font-weight:700; color:var(--ink); word-break:break-all; }
.loc { display:inline-block; margin-top:9px; padding:3px 8px; border-radius:4px; border:1.5px solid var(--ink); font-size:12px; font-weight:800; letter-spacing:.12em; color:var(--ink); }
.shot { position:relative; overflow:hidden; border-radius:8px; border:1px solid var(--line); background:var(--surface); box-shadow:0 1px 0 rgba(32,36,31,.05), 0 12px 26px -16px rgba(32,36,31,.5); }
.shot img { display:block; width:100%; }
.shot.dim img { opacity:.35; filter:grayscale(1); }
.shot .stamp { position:absolute; left:10px; bottom:10px; right:10px; text-align:center; padding:7px 8px; border-radius:6px; background:var(--surface); border:1px solid var(--line); color:var(--ink); font-size:12px; font-weight:700; }
.badges { position:absolute; top:8px; right:8px; display:flex; gap:5px; }
.badge { height:24px; min-width:24px; padding:0 7px; border-radius:4px; display:flex; align-items:center; justify-content:center; gap:4px; font-weight:800; font-size:13px; color:#fff; box-shadow:0 0 0 2px #fff, 0 3px 8px rgba(32,36,31,.25); }
.badge.err { background:var(--err); } .badge.warn { background:var(--warn); } .badge.ok { background:var(--ok); }
.badge.na { background:#ece6da; color:var(--ink); font-size:12px; } .badge.fail { background:var(--ink); font-size:12px; }
.badge small { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.06em; opacity:.92; }
.scribble { position:absolute; left:0; top:0; overflow:visible; pointer-events:none; }
.scribble path { fill:none; stroke-width:3.2; stroke-linecap:round; stroke-linejoin:round; }
.scribble.err path { stroke:var(--accent); } .scribble.ok path { stroke:var(--ok); }
.note { position:absolute; padding:3px 7px; transform:rotate(-4deg); background:var(--surface); border:2px solid; border-radius:4px; font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; white-space:nowrap; box-shadow:0 3px 8px rgba(32,36,31,.2); }
.note.err { color:var(--accent); border-color:var(--accent); } .note.ok { color:var(--ok); border-color:var(--ok); }
footer { display:flex; justify-content:space-between; align-items:center; margin-top:34px; padding-top:16px; border-top:1px solid var(--line); color:var(--muted); font-size:13px; }
footer .powered { display:flex; align-items:center; gap:9px; }
footer b { color:var(--ink); font-weight:800; }
`;

/** Count badges for one cell. */
export function badgesHtml(cell) {
  if (!cell) return '';
  if (cell.status === 'failed') return '<div class="badges"><div class="badge fail">failed</div></div>';
  if (cell.status === 'not-localized') return '<div class="badges"><div class="badge na">n/l</div></div>';
  const parts = [];
  if (cell.errors) parts.push(`<div class="badge err">${cell.errors}<small>err</small></div>`);
  if (cell.warnings) parts.push(`<div class="badge warn">${cell.warnings}<small>warn</small></div>`);
  if (!parts.length) parts.push('<div class="badge ok">&#10003;</div>');
  return `<div class="badges">${parts.join('')}</div>`;
}
