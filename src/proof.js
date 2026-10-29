import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderHtmlToPng } from './contact-sheet.js';
import { launchBrowser } from './look.js';
import { UsageError, readStorageState } from './options.js';
import { applyDarkStrategy, contextOptions, fontsReady, settle } from './page.js';
import { formatLocalTime } from './report.js';
import {
  BASE_CSS, MOON, SUN, arrowValue, brandStyle, escapeHtml, footerHtml, headerHtml, kickerHtml, mascotStamp, pickSignature, plural, qrCardHtml, roundStamp,
  scribbleHtml, statCard, thumbRect,
} from './sheet-style.js';
import { firstLine } from './util.js';

/**
 * Resolve a run directory argument. Accepts a run dir (has report.json), an out dir (uses its
 * `latest`), or the aliases `latest`, `prev`/`previous` and `first` relative to `.mantis/`.
 */
export async function resolveRunDir(arg, base = '.mantis') {
  const runsDir = path.resolve(base, 'runs');
  const listRuns = async () => {
    if (!existsSync(runsDir)) return [];
    const names = (await readdir(runsDir)).filter((n) => existsSync(path.join(runsDir, n, 'report.json'))).sort();
    return names.map((n) => path.join(runsDir, n));
  };
  if (arg === 'latest') return path.resolve(base, 'latest');
  if (arg === 'prev' || arg === 'previous') {
    const runs = await listRuns();
    if (runs.length < 2) throw new UsageError(`"${arg}" needs at least two runs in ${runsDir}`);
    return runs[runs.length - 2];
  }
  if (arg === 'first') {
    const runs = await listRuns();
    if (!runs.length) throw new UsageError(`no runs in ${runsDir}`);
    return runs[0];
  }
  const p = path.resolve(arg);
  if (existsSync(path.join(p, 'report.json'))) return p;
  if (existsSync(path.join(p, 'latest', 'report.json'))) return path.join(p, 'latest');
  throw new UsageError(`no report.json in ${arg} (pass a run directory such as .mantis/runs/<timestamp> or .mantis/latest)`);
}

async function loadReport(dir) {
  return JSON.parse(await readFile(path.join(dir, 'report.json'), 'utf8'));
}

const THUMB_H = 210;
const cellKey = (c) => `${c.route}\u0000${c.locale}\u0000${c.viewport}\u0000${c.scheme}`;

function countsHtml(cell) {
  if (!cell) return '<span class="muted">not run</span>';
  if (cell.status === 'failed') return '<span class="bad">failed to load</span>';
  if (cell.status === 'not-localized') return '<span class="muted">not localized</span>';
  if (!cell.errors && !cell.warnings) return '<span class="good">&#10003; clean</span>';
  const parts = [];
  if (cell.errors) parts.push(`<span class="bad">${cell.errors} err</span>`);
  if (cell.warnings) parts.push(`<span class="warnc">${cell.warnings} warn</span>`);
  return parts.join(' · ');
}

function deltaHtml(b, a) {
  const be = b.errors || 0;
  const ae = a.errors || 0;
  if (ae === 0 && be === 0) return '<span class="delta same">clean</span>';
  const tone = ae === 0 ? 'good' : ae >= be ? 'bad' : 'some';
  return `<span class="delta ${tone}"><small>${be}</small> &rarr; <b>${ae}</b></span>`;
}

function summaryText(before, after, vs) {
  const be = before.summary.errors;
  const ae = after.summary.errors;
  let text;
  if (be === 0 && ae === 0) text = '<strong class="ok">No errors</strong> before or after the change.';
  else if (ae === 0) text = `<strong class="err">${plural(be, 'error')}</strong> before; <strong class="ok">0 remaining</strong> after the patch.`;
  else text = `<strong class="err">${plural(be, 'error')}</strong> before; <strong class="err">${ae} ${ae === 1 ? 'remains' : 'remain'}</strong>. Review the unresolved findings.`;
  if (vs) text += ` ${vs.fixed.length} fixed, ${vs.new.length} new, <strong class="${vs.coverUps ? 'err' : 'ok'}">${plural(vs.coverUps, 'cover-up')}</strong>.`;
  return text;
}

/**
 * Before/after sheet. Same grid as the contact sheet (rows = route + locale, columns = viewport
 * x scheme), but every cell holds the before screenshot on the left and the after one on the
 * right, with per-cell counts and run totals. Only cells present in both runs are compared.
 * When the after run was compared with the before run (look --baseline), its fixed / new /
 * cover-up counts are shown too. One finding is circled: a cover-up on the after side, or else
 * an issue that the after run no longer has, on both sides.
 */
/**
 * Cells present in both runs, the grid columns, and the one finding to circle: a cover-up in
 * the after run, or else an issue of the before run that the after run no longer has. A fix
 * moves things, so the circle sits at the same place on both sides only when the page is
 * equally wide in both screenshots.
 */
export function proofLayout(before, after) {
  const afterBy = new Map(after.cells.map((c) => [cellKey(c), c]));
  const pairs = new Map();
  for (const b of before.cells) {
    const a = afterBy.get(cellKey(b));
    if (a) pairs.set(cellKey(b), { b, a });
  }
  const all = [...pairs.values()].map((p) => p.a);
  const keep = (order, field) => order.filter((x) => all.some((c) => c[field] === (typeof x === 'string' ? x : x.name)));
  const cols = [];
  for (const v of keep(after.matrix.viewports, 'viewport')) {
    for (const s of keep(after.matrix.schemes, 'scheme')) cols.push({ v, s, w: Math.max(96, Math.round((THUMB_H * v.width) / v.height)) });
  }
  const widthOf = (cell) => cols.find((c) => c.v.name === cell.viewport && c.s === cell.scheme)?.w ?? 0;
  const fits = (cell, rect) => {
    const p = pairs.get(cellKey(cell));
    return !!p && !!thumbRect(cell, rect, widthOf(cell), THUMB_H) && (p.a.shotWidth || p.a.width) === (p.b.shotWidth || p.b.width);
  };
  let mark = null;
  const cover = pickSignature(after, fits, (i) => i.type === 'cover-up');
  if (cover) {
    mark = { kind: 'cover-up', issue: cover.issue, rect: cover.rect, ...pairs.get(cellKey(cover.cell)) };
  } else {
    const remaining = new Set(after.issues.map((i) => i.fingerprint));
    const fixed = pickSignature(before, fits, (i) => i.fingerprint && !remaining.has(i.fingerprint));
    if (fixed) mark = { kind: 'fixed', issue: fixed.issue, rect: fixed.rect, ...pairs.get(cellKey(fixed.cell)) };
  }
  return {
    pairs,
    all,
    cols,
    routes: keep(after.matrix.routes, 'route'),
    locales: keep(after.matrix.locales, 'locale'),
    skipped: before.cells.length + after.cells.length - 2 * pairs.size,
    vs: after.baseline && after.baseline.runId === before.runId ? after.baseline : null,
    mark,
  };
}

/** The notes written next to the circle on each side. */
function markNotes(mark) {
  if (mark.kind === 'cover-up') return { before: null, after: { note: 'hidden, not fixed', tone: 'err' } };
  return { before: { note: `found at ${mark.b.width} px`, tone: 'err' }, after: { note: 'fixed', tone: 'ok' } };
}

export function proofHtml(before, after, beforeDir, afterDir) {
  const { pairs, all, cols, routes, locales, skipped, vs, mark } = proofLayout(before, after);
  const marks = new Map(); // cellKey + side -> {rect, note, tone}
  if (mark) {
    const notes = markNotes(mark);
    for (const side of ['before', 'after']) {
      if (notes[side]) marks.set(`${cellKey(mark.b)}|${side}`, { rect: mark.rect, ...notes[side] });
    }
  }
  const src = (dir, cell) => (cell && cell.screenshot ? pathToFileURL(path.join(dir, cell.screenshot)).href : null);

  const thumb = (dir, cell, w, which) => {
    const s = src(dir, cell);
    const dim = cell && cell.status !== 'ok' ? ' dim' : '';
    const mark = cell && marks.get(`${cellKey(cell)}|${which}`);
    const spot = mark && thumbRect(cell, mark.rect, w, THUMB_H);
    const scribble = spot ? scribbleHtml(spot, w, THUMB_H, mark.note, mark.tone) : '';
    return `<figure><div class="shot${dim}" style="width:${w}px;height:${THUMB_H}px">${s ? `<img src="${escapeHtml(s)}" alt="">` : ''}${scribble}</div>` +
      `<figcaption class="${which}"><span class="tag">${which === 'before' ? 'Before' : 'After'}</span>${countsHtml(cell)}</figcaption></figure>`;
  };

  const rows = [];
  for (const route of routes) {
    for (const loc of locales) {
      if (!all.some((c) => c.route === route && c.locale === loc)) continue;
      rows.push(`<div class="rowhead"><div class="route">${escapeHtml(route)}</div><div class="loc">${escapeHtml(loc.toUpperCase())}</div></div>`);
      for (const c of cols) {
        const p = pairs.get(`${route}\u0000${loc}\u0000${c.v.name}\u0000${c.s}`);
        if (!p) {
          rows.push('<div></div>');
          continue;
        }
        rows.push(`<div class="pair"><div class="pairhead">${c.s === 'dark' ? MOON : SUN}<b>${escapeHtml(c.v.name)}</b><em>${escapeHtml(c.s)}</em>${deltaHtml(p.b, p.a)}</div>` +
          `<div class="thumbs">${thumb(beforeDir, p.b, c.w, 'before')}${thumb(afterDir, p.a, c.w, 'after')}</div></div>`);
      }
    }
  }

  const bs = before.summary;
  const as = after.summary;
  const stats = [
    statCard(arrowValue(bs.errors, as.errors, as.errors ? 'err' : 'ok'), 'errors', { note: as.errors ? `${as.errors} left` : bs.errors ? 'all fixed' : 'none' }),
    statCard(arrowValue(bs.warnings, as.warnings, as.warnings ? 'warn' : 'ok'), 'warnings', { note: as.warnings ? `${as.warnings} left` : bs.warnings ? 'all fixed' : 'none' }),
    vs ? statCard(vs.coverUps, vs.coverUps === 1 ? 'cover-up' : 'cover-ups', { tone: vs.coverUps ? 'err' : 'ok', note: vs.coverUps ? 'hidden, not fixed' : 'honest fix' }) : '',
    statCard(pairs.size, 'cells', { note: 'compared' }),
  ].join('');
  const colTemplate = cols.map((c) => `${2 * c.w + 12 + 26}px`).join(' ');
  const project = after.project ?? before.project ?? null;
  const when = `${escapeHtml(formatLocalTime(before.startedAt))} &rarr; ${escapeHtml(formatLocalTime(after.startedAt))}`;
  const meta = before.url === after.url ? `${escapeHtml(after.url)} · ${when}` : `${escapeHtml(before.url)} &rarr; ${escapeHtml(after.url)} · ${when}`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Mantis proof</title><style>${BASE_CSS}
.grid { display:grid; grid-template-columns: 170px ${colTemplate}; gap:18px; align-items:start; }
.pair { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:11px 12px 12px; box-shadow:0 1px 0 rgba(32,36,31,.04), 0 12px 26px -18px rgba(32,36,31,.5); }
.pairhead { display:flex; align-items:center; gap:7px; margin-bottom:10px; color:var(--ink); font-size:12px; }
.pairhead b { text-transform:uppercase; letter-spacing:.12em; font-weight:800; }
.pairhead em { font-style:normal; color:var(--muted); }
.delta { margin-left:auto; padding:2px 8px; border-radius:4px; border:1.5px solid var(--line); font-size:13px; font-weight:800; white-space:nowrap; color:var(--ink); }
.delta small { font-size:13px; color:var(--muted); font-weight:700; }
.delta.good b { color:var(--ok); } .delta.good { border-color:var(--ok); }
.delta.bad b, .delta.some b { color:var(--err); } .delta.bad { border-color:var(--err); }
.delta.same { color:var(--muted); }
.pair .shot { border-radius:6px; box-shadow:none; }
.thumbs { display:flex; gap:12px; }
figure { margin:0; }
figcaption { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:7px; padding:4px 6px; border-radius:4px; font-size:11px; font-weight:700; }
figcaption.before { background:#efe9de; } figcaption.after { background:var(--ok-soft); }
.tag { font-size:10px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--ink); }
figcaption.after .tag { color:var(--ok); }
.good { color:var(--ok); } .bad { color:var(--err); } .warnc { color:var(--warn); } .muted { color:var(--muted); }
</style></head><body${brandStyle(project)}>
${headerHtml({ project, url: after.url, title: 'Fix receipt', round: roundStamp(2, 'Verify'), summary: summaryText(before, after, vs), meta, stats })}
<div class="grid">${rows.join('')}</div>
${footerHtml(`before ${escapeHtml(before.runId)} · after ${escapeHtml(after.runId)}${skipped ? ` · ${plural(skipped, 'cell')} present in only one run not compared` : ''}`)}
</body></html>`;
}

const TYPE_NAMES = {
  'cover-up': 'Cover-up',
  'page-overflow': 'Page overflow',
  'clipped-text': 'Cut-off text',
  overlap: 'Overlap',
  contrast: 'Low contrast',
  'theme-leak': 'Dark-mode leak',
  'tap-target': 'Tiny tap target',
  'broken-image': 'Broken image',
};
const ZOOM_W = 600;

function runStats(before, after, vs) {
  const bs = before.summary;
  const as = after.summary;
  return [
    statCard(arrowValue(bs.errors, as.errors, as.errors ? 'err' : 'ok'), 'errors', { note: 'whole run' }),
    vs ? statCard(vs.coverUps, vs.coverUps === 1 ? 'cover-up' : 'cover-ups', { tone: vs.coverUps ? 'err' : 'ok', note: vs.coverUps ? 'hidden, not fixed' : 'honest fix' }) : '',
  ].join('');
}

/**
 * Close-up of the circled finding: the same region of the before and the after screenshot,
 * cropped at the same coordinates and enlarged side by side.
 * @param {ReturnType<typeof proofLayout>} layout  needs a mark
 */
export function zoomHtml(before, after, beforeDir, afterDir, layout) {
  const { mark, vs } = layout;
  const { issue, rect, b, a } = mark;
  const shotW = b.shotWidth || b.width;
  const pad = Math.max(56, 0.5 * Math.max(rect.width, rect.height));
  const cw = Math.min(shotW, Math.max(rect.width + 2 * pad, 300));
  const ch = Math.max(rect.height + 2 * pad, 220);
  const cx = Math.max(0, Math.min(shotW - cw, rect.x + rect.width / 2 - cw / 2));
  const cy = Math.max(0, rect.y + rect.height / 2 - ch / 2);
  const z = Math.min(3, ZOOM_W / cw);
  const W = Math.round(cw * z);
  const H = Math.round(ch * z);
  const notes = markNotes(mark);
  const crop = (dir, cell, which) => {
    const src = pathToFileURL(path.join(dir, cell.screenshot)).href;
    const local = { x: (rect.x - cx) * z, y: (rect.y - cy) * z, width: rect.width * z, height: rect.height * z };
    const note = notes[which];
    return `<figure><div class="crop" style="width:${W}px;height:${H}px"><img src="${escapeHtml(src)}" alt="" style="left:${(-cx * z).toFixed(1)}px;top:${(-cy * z).toFixed(1)}px;width:${(shotW * z).toFixed(1)}px">` +
      `${note ? scribbleHtml(local, W, H, note.note, note.tone) : ''}</div>` +
      `<figcaption class="${which}"><span class="tag">${which === 'before' ? 'Before' : 'After'}</span>${countsHtml(cell)}</figcaption></figure>`;
  };
  const project = after.project ?? before.project ?? null;
  const name = TYPE_NAMES[issue.type] ?? issue.type;
  const title = mark.kind === 'cover-up' ? 'Hidden, not fixed' : `${name}, fixed`;
  const where = `${escapeHtml(b.route)} · ${escapeHtml(b.viewport)} ${b.width}px · ${escapeHtml(b.scheme)} · ${escapeHtml(b.locale)}`;
  const message = issue.message.length > 220 ? `${issue.message.slice(0, 219)}…` : issue.message;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mantis close-up</title><style>${BASE_CSS}
.pairs { display:flex; gap:32px; align-items:flex-start; }
.crop { position:relative; overflow:hidden; border-radius:10px; border:1px solid var(--line); background:var(--surface); box-shadow:0 1px 0 rgba(32,36,31,.05), 0 16px 30px -18px rgba(32,36,31,.5); }
.crop img { position:absolute; max-width:none; }
.crop .note { font-size:14px; padding:4px 9px; }
.crop .scribble path { stroke-width:4; }
figure { margin:0; }
figcaption { display:flex; align-items:center; gap:10px; margin-top:10px; padding:7px 10px; border-radius:6px; font-size:15px; font-weight:700; }
figcaption.before { background:#efe9de; } figcaption.after { background:var(--ok-soft); }
.tag { font-size:13px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; color:var(--ink); }
figcaption.after .tag { color:var(--ok); }
.good { color:var(--ok); } .bad { color:var(--err); } .warnc { color:var(--warn); } .muted { color:var(--muted); }
.summary code { font-family:var(--mono); font-size:17px; }
</style></head><body${brandStyle(project)}>
${headerHtml({ project, url: after.url, title, round: roundStamp(2, 'Verify'), summary: escapeHtml(message).replace(/`([^`]+)`/g, '<code>$1</code>'), meta: where, stats: runStats(before, after, vs) })}
<div class="pairs">${crop(beforeDir, b, 'before')}${crop(afterDir, a, 'after')}</div>
${footerHtml(`same ${Math.round(cw)}&times;${Math.round(ch)} px region of both screenshots, ${z.toFixed(1)}&times;`)}
</body></html>`;
}

function run(cmd, args) {
  return new Promise((resolve) => {
    let stderr = '';
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      resolve({ code: -1, stderr: err.message });
      return;
    }
    child.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > 20000) stderr = stderr.slice(-20000);
    });
    child.on('error', (err) => resolve({ code: -1, stderr: err.message }));
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

export async function hasFfmpeg() {
  const r = await run('ffmpeg', ['-hide_banner', '-version']);
  return r.code === 0;
}

/** Record the scripted visit: load, scroll down and back up, then switch to the dark scheme. */
async function recordVisit(browser, url, viewport, darkStrategy, dir, session) {
  const context = await browser.newContext({
    ...contextOptions({ viewport, scheme: 'light', locale: 'en' }, session),
    reducedMotion: 'no-preference',
    recordVideo: { dir, size: { width: viewport.width, height: viewport.height } },
  });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await settle(page, { idleTimeout: 5000 });
    await fontsReady(page);
    await page.waitForTimeout(700);
    await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      const glide = async (from, to, ms) => {
        const steps = Math.max(1, Math.round(ms / 16));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
          window.scrollTo({ top: from + (to - from) * e, behavior: 'instant' });
          await sleep(16);
        }
      };
      await glide(0, Math.min(max, 2400), 2200);
      await sleep(400);
      await glide(scrollY, 0, 1200);
      await sleep(300);
    });
    await page.emulateMedia({ colorScheme: 'dark' });
    await applyDarkStrategy(page, darkStrategy, 'dark');
    await page.waitForTimeout(1600);
  } finally {
    await context.close();
  }
  const video = page.video();
  return video ? video.path() : null;
}

/** A label bar ("BEFORE"/"AFTER" + URL) on paper, rendered by Chromium, overlaid by ffmpeg. */
async function renderLabel(browser, file, label, url, width) {
  const page = await browser.newPage({ viewport: { width, height: 44 }, deviceScaleFactor: 1 });
  try {
    const color = label === 'AFTER' ? '#26774a' : '#c52e3f';
    await page.setContent(`<!doctype html><html><body style="margin:0;width:${width}px;height:44px;box-sizing:border-box;padding:0 12px;display:flex;align-items:center;gap:10px;background:#f7f3ea;font-family:Inter,ui-sans-serif,system-ui,'Segoe UI',Roboto,Arial,sans-serif">
      <span style="flex:none;padding:5px 9px;border-radius:4px;background:${color};color:#fff;font-size:13px;font-weight:800;letter-spacing:.12em">${label}</span>
      <span style="min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#686b63;font-size:12px;font-family:Consolas,'DejaVu Sans Mono',monospace">${escapeHtml(url)}</span></body></html>`);
    await page.screenshot({ path: file });
  } finally {
    await page.close();
  }
}

/** Title and closing cards for the video, sized to the composed frame. */
export function videoCards(before, after) {
  const { vs } = proofLayout(before, after);
  const project = after.project ?? before.project ?? null;
  const card = (body) => (W, H) => `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}
body { width:${W}px; height:${H}px; min-width:0; padding:40px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:24px; text-align:center; }
h1 { justify-content:center; flex-wrap:wrap; }
.summary { max-width:${Math.max(320, W - 120)}px; }
.totals { justify-content:center; flex-wrap:wrap; }
.powered { display:flex; align-items:center; gap:9px; color:var(--muted); font-size:15px; } .powered b { color:var(--ink); }
</style></head><body${brandStyle(project)}>${body}</body></html>`;
  const intro = card(`${mascotStamp(150)}${kickerHtml(project, after.url)}<h1><span class="uline">Fix receipt</span>${roundStamp(2, 'Verify')}</h1><p class="summary">${summaryText(before, after, vs)}</p>`);
  const outro = card(`<div class="totals">${runStats(before, after, vs)}</div><p class="summary">${summaryText(before, after, vs)}</p>${qrCardHtml(project)}<div class="powered">${mascotStamp(44)}<b>Powered by Mantis</b> · sees 12 color channels</div>`);
  return { intro, outro };
}

async function renderCard(browser, html, file, width, height) {
  const htmlFile = file.replace(/\.png$/, '.html');
  await writeFile(htmlFile, html);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    await page.goto(pathToFileURL(htmlFile).href, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.screenshot({ path: file });
  } finally {
    await page.close();
  }
}

/**
 * Record both URLs and compose a side-by-side MP4 (before left, after right) with ffmpeg hstack,
 * between a title card and a closing card when `cards` (videoCards) are given.
 * Returns null (and logs why) when ffmpeg is not available; the raw .webm files are kept then.
 */
export async function proofVideo(browser, opts, log, cards = null) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-video-'));
  try {
    const strategy = opts.darkStrategy ?? { kind: 'media' };
    const session = opts.storageState ? await readStorageState(opts.storageState) : null;
    const beforeWebm = await recordVisit(browser, opts.beforeUrl, opts.viewport, strategy, path.join(tmp, 'before'), session);
    const afterWebm = await recordVisit(browser, opts.afterUrl, opts.viewport, strategy, path.join(tmp, 'after'), session);
    const out = path.resolve(opts.videoOut);
    await mkdir(path.dirname(out), { recursive: true });
    if (!(await hasFfmpeg())) {
      const keep = out.replace(/\.mp4$/i, '');
      await rename(beforeWebm, `${keep}.before.webm`);
      await rename(afterWebm, `${keep}.after.webm`);
      log(`ffmpeg not found: skipped the side-by-side MP4 (kept ${path.basename(keep)}.before.webm and .after.webm)`);
      return null;
    }
    const w = opts.viewport.width + (opts.viewport.width % 2);
    const h = opts.viewport.height + (opts.viewport.height % 2);
    const beforeLabel = path.join(tmp, 'before-label.png');
    const afterLabel = path.join(tmp, 'after-label.png');
    await renderLabel(browser, beforeLabel, 'BEFORE', opts.beforeUrl, w);
    await renderLabel(browser, afterLabel, 'AFTER', opts.afterUrl, w);
    const side = (input, label, name) =>
      `[${input}:v]scale=${w}:${h},setsar=1,fps=25,pad=${w}:${h + 44}:0:44:color=0xf7f3ea[${name}0];[${name}0][${label}:v]overlay=0:0:eof_action=repeat[${name}]`;
    let filter = `${side(0, 2, 'a')};${side(1, 3, 'b')};[a][b]hstack=inputs=2,pad=iw+24:ih+12:12:0:color=0xf7f3ea`;
    const inputs = ['-i', beforeWebm, '-i', afterWebm, '-i', beforeLabel, '-i', afterLabel];
    if (cards) {
      const W = 2 * w + 24;
      const H = h + 56;
      const intro = path.join(tmp, 'intro.png');
      const outro = path.join(tmp, 'outro.png');
      await renderCard(browser, cards.intro(W, H), intro, W, H);
      await renderCard(browser, cards.outro(W, H), outro, W, H);
      inputs.push('-loop', '1', '-t', '2.4', '-i', intro, '-loop', '1', '-t', '3.6', '-i', outro);
      const still = (input, name) => `[${input}:v]scale=${W}:${H},setsar=1,fps=25,format=yuv420p[${name}]`;
      filter += `,format=yuv420p[m];${still(4, 'i')};${still(5, 'o')};[i][m][o]concat=n=3:v=1:a=0[v]`;
    } else {
      filter += '[v]';
    }
    const base = ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[v]', '-an'];
    let r = await run('ffmpeg', [...base, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
    if (r.code !== 0) r = await run('ffmpeg', [...base, '-c:v', 'mpeg4', '-q:v', '3', out]);
    if (r.code !== 0) throw new Error(`ffmpeg failed: ${firstLine(r.stderr)}`);
    return out;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/**
 * `mantis proof`: before/after PNG sheet from two runs plus a close-up of the circled finding
 * (`<out>-zoom.png`), and optionally a side-by-side video, with title and closing cards when the
 * two runs are given too.
 * @param {import('./options.js').ProofOptions} opts
 */
export async function proof(opts, { log = () => {} } = {}) {
  const result = { png: null, zoom: null, video: null };
  let beforeDir = null;
  let afterDir = null;
  if (opts.before) {
    beforeDir = await resolveRunDir(opts.before);
    afterDir = await resolveRunDir(opts.after);
  }
  const browser = await launchBrowser();
  try {
    let cards = null;
    if (beforeDir) {
      const [before, after] = await Promise.all([loadReport(beforeDir), loadReport(afterDir)]);
      const out = path.resolve(opts.out);
      await mkdir(path.dirname(out), { recursive: true });
      const html = proofHtml(before, after, beforeDir, afterDir);
      await renderHtmlToPng(browser, html, path.join(path.dirname(out), `.mantis-proof-${process.pid}.html`), out);
      result.png = out;
      const layout = proofLayout(before, after);
      if (layout.mark) {
        const zoom = out.replace(/\.png$/i, '-zoom.png');
        await renderHtmlToPng(browser, zoomHtml(before, after, beforeDir, afterDir, layout), path.join(path.dirname(out), `.mantis-zoom-${process.pid}.html`), zoom);
        result.zoom = zoom;
      }
      result.before = { dir: beforeDir, errors: before.summary.errors, warnings: before.summary.warnings };
      result.after = { dir: afterDir, errors: after.summary.errors, warnings: after.summary.warnings };
      cards = videoCards(before, after);
    }
    if (opts.video) result.video = await proofVideo(browser, opts, log, cards);
  } finally {
    await browser.close().catch(() => {});
  }
  return result;
}
