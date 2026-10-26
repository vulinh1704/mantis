/** Shared look for the contact sheet and the proof sheet (rendered by Chromium, then screenshotted). */

export const SPECTRUM = [
  '#ff2d55', '#ff6a3d', '#ffa62b', '#ffd60a', '#a3e635', '#34d399',
  '#22d3ee', '#38bdf8', '#6366f1', '#8b5cf6', '#d946ef', '#f472b6',
];

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const SUN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
export const MOON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z"/></svg>';

/** The Mantis mark: a 12-band spectrum disc (a mantis shrimp sees 12 color channels). */
export function markSvg(size = 44) {
  const n = SPECTRUM.length;
  const r = 20;
  const paths = SPECTRUM.map((c, i) => {
    const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / n) * Math.PI * 2 - Math.PI / 2;
    const x0 = 22 + r * Math.cos(a0);
    const y0 = 22 + r * Math.sin(a0);
    const x1 = 22 + r * Math.cos(a1);
    const y1 = 22 + r * Math.sin(a1);
    return `<path d="M22 22 L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${c}"/>`;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 44 44">${paths}<circle cx="22" cy="22" r="9.5" fill="#0b0d14"/><circle cx="22" cy="22" r="4.2" fill="#f5f7ff"/><circle cx="23.6" cy="20.6" r="1.5" fill="#0b0d14"/></svg>`;
}

export const BASE_CSS = `
:root { --bg:#0a0c12; --panel:#121521; --line:#252a3a; --text:#eef1f8; --muted:#8a91a8; --err:#ff2d55; --warn:#ffb020; --ok:#2fd27f; }
* { box-sizing:border-box; margin:0; padding:0; }
html { background:var(--bg); }
body { width:max-content; min-width:900px; padding:40px 44px 36px; color:var(--text);
  background: radial-gradient(1400px 700px at -10% -20%, #1b2140 0%, rgba(10,12,18,0) 60%), radial-gradient(900px 500px at 110% 0%, #2a1630 0%, rgba(10,12,18,0) 55%), var(--bg);
  font-family: Inter, "Inter Display", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Liberation Sans", sans-serif;
  -webkit-font-smoothing: antialiased; }
header { display:flex; align-items:flex-end; justify-content:space-between; gap:48px; margin-bottom:30px; }
.brand { display:flex; align-items:center; gap:16px; }
.title { font-size:36px; font-weight:800; letter-spacing:-0.025em; line-height:1; }
.title small { font-size:15px; font-weight:600; letter-spacing:0; color:var(--muted); margin-left:10px; }
.sub { color:var(--muted); font-size:14px; margin-top:8px; }
.sub code { font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace; color:#c9cfe3; font-size:13px; }
.spectrum { display:flex; height:4px; width:264px; border-radius:4px; overflow:hidden; margin-top:12px; }
.spectrum i { flex:1; }
.totals { display:flex; gap:10px; }
.stat { background:rgba(255,255,255,.04); border:1px solid var(--line); border-radius:14px; padding:12px 16px; min-width:112px; }
.stat b { display:block; font-size:28px; font-weight:800; letter-spacing:-0.02em; line-height:1.05; }
.stat span { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; }
.stat.err b { color:var(--err); } .stat.warn b { color:var(--warn); } .stat.ok b { color:var(--ok); }
.badges { position:absolute; top:8px; right:8px; display:flex; gap:6px; }
.badge { height:26px; min-width:26px; padding:0 9px; border-radius:999px; display:flex; align-items:center; justify-content:center; gap:4px; font-weight:800; font-size:13px; box-shadow:0 2px 10px rgba(0,0,0,.45), 0 0 0 2px rgba(10,12,18,.55); }
.badge.err { background:var(--err); color:#fff; } .badge.warn { background:var(--warn); color:#1d1d1f; } .badge.ok { background:var(--ok); color:#06210f; }
.badge.na { background:#3a3f52; color:#e4e7f2; font-weight:700; font-size:12px; } .badge.fail { background:#111; color:#fff; border:1px solid #555; font-size:12px; }
.badge small { font-size:10px; font-weight:700; opacity:.85; text-transform:uppercase; letter-spacing:.04em; }
.shot { position:relative; overflow:hidden; border-radius:12px; border:1px solid var(--line); background:#fff; box-shadow:0 12px 32px rgba(0,0,0,.42); }
.shot img { display:block; width:100%; }
.shot.dim img { opacity:.3; filter:grayscale(1); }
.shot.dim { background:#1a1d28; }
.shot .stamp { position:absolute; left:10px; bottom:10px; right:10px; text-align:center; padding:7px 8px; border-radius:9px; background:rgba(10,12,18,.82); color:#e8ebf5; font-size:12px; font-weight:600; }
footer { display:flex; justify-content:space-between; margin-top:26px; color:var(--muted); font-size:12px; }
footer b { color:#c9cfe3; font-weight:700; }
.colhead { display:flex; flex-direction:column; gap:3px; color:#c3c8da; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.09em; }
.colhead .ch1 { display:flex; align-items:center; gap:7px; }
.colhead em { font-style:normal; font-weight:500; color:var(--muted); letter-spacing:0; text-transform:none; white-space:nowrap; }
.rowhead { padding-top:6px; }
.route { font-family: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "DejaVu Sans Mono", monospace; font-size:15px; font-weight:600; color:#f0f2fa; word-break:break-all; }
.loc { display:inline-block; margin-top:8px; padding:3px 8px; border-radius:6px; background:rgba(255,255,255,.07); border:1px solid var(--line); font-size:11px; font-weight:800; letter-spacing:.1em; color:#cdd2e4; }
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
