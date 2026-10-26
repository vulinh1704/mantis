import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderHtmlToPng } from './contact-sheet.js';
import { launchBrowser } from './look.js';
import { UsageError } from './options.js';
import { contextOptions, fontsReady, settle } from './page.js';
import { formatLocalTime } from './report.js';
import { BASE_CSS, MOON, SPECTRUM, SUN, badgesHtml, escapeHtml, markSvg } from './sheet-style.js';
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

const THUMB_H = 230;

/** Side-by-side before/after sheet: one card per cell, before on the left, after on the right. */
export function proofHtml(before, after, beforeDir, afterDir) {
  const viewports = new Map();
  for (const v of [...before.matrix.viewports, ...after.matrix.viewports]) viewports.set(v.name, v);
  const ids = [];
  for (const c of [...before.cells, ...after.cells]) if (!ids.includes(c.id)) ids.push(c.id);
  const find = (rep, id) => rep.cells.find((c) => c.id === id);
  const src = (dir, cell) => (cell && cell.screenshot ? pathToFileURL(path.join(dir, cell.screenshot)).href : null);

  const groups = new Map(); // "route · locale" -> cells
  for (const id of ids) {
    const c = find(after, id) || find(before, id);
    const key = `${c.route}\u0000${c.locale}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  }

  const delta = (b, a) => {
    if (!b || !a) return '<span class="delta same">n/a</span>';
    const be = b.errors || 0;
    const ae = a.errors || 0;
    if (ae < be) return `<span class="delta good">${be} &rarr; ${ae} errors</span>`;
    if (ae > be) return `<span class="delta bad">${be} &rarr; ${ae} errors</span>`;
    return `<span class="delta same">${ae} error${ae === 1 ? '' : 's'}</span>`;
  };

  const sections = [];
  for (const [key, list] of groups) {
    const [route, locale] = key.split('\u0000');
    const cards = list.map((id) => {
      const b = find(before, id);
      const a = find(after, id);
      const c = a || b;
      const v = viewports.get(c.viewport) || { width: c.width, height: c.height };
      const w = Math.max(100, Math.round((THUMB_H * v.width) / v.height));
      const thumb = (dir, cell, label) => {
        const s = src(dir, cell);
        const dim = cell && cell.status !== 'ok' ? ' dim' : '';
        return `<div class="half"><div class="tag ${label}">${label === 'before' ? 'BEFORE' : 'AFTER'}</div><div class="shot${dim}" style="width:${w}px;height:${THUMB_H}px">${s ? `<img src="${escapeHtml(s)}" alt="">` : ''}${badgesHtml(cell)}${cell ? '' : '<div class="stamp">not in this run</div>'}</div></div>`;
      };
      return `<div class="card"><div class="cardhead">${c.scheme === 'dark' ? MOON : SUN}<b>${escapeHtml(c.viewport)}</b><em>${escapeHtml(c.scheme)}</em>${delta(b, a)}</div><div class="pair">${thumb(beforeDir, b, 'before')}${thumb(afterDir, a, 'after')}</div></div>`;
    });
    sections.push(`<section><div class="sechead"><span class="route">${escapeHtml(route)}</span><span class="loc">${escapeHtml(locale.toUpperCase())}</span></div><div class="cards">${cards.join('')}</div></section>`);
  }

  const bs = before.summary;
  const as = after.summary;
  const totals = `
    <div class="stat ${bs.errors ? 'err' : 'ok'}"><b>${bs.errors}</b><span>errors before</span></div>
    <div class="arrow">&rarr;</div>
    <div class="stat ${as.errors ? 'err' : 'ok'}"><b>${as.errors}</b><span>errors after</span></div>
    <div class="stat ${as.warnings ? 'warn' : 'ok'}" style="margin-left:14px"><b>${bs.warnings}&rarr;${as.warnings}</b><span>warnings</span></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>Mantis proof</title><style>${BASE_CSS}
body { max-width: 2000px; }
.arrow { align-self:center; font-size:26px; color:var(--muted); }
section { margin-top:22px; }
.sechead { display:flex; align-items:center; gap:10px; margin-bottom:12px; }
.sechead .loc { margin-top:0; }
.cards { display:flex; flex-wrap:wrap; gap:16px; }
.card { background:rgba(255,255,255,.035); border:1px solid var(--line); border-radius:16px; padding:12px 14px 14px; }
.cardhead { display:flex; align-items:center; gap:7px; margin-bottom:10px; color:#c3c8da; font-size:12px; }
.cardhead b { text-transform:uppercase; letter-spacing:.09em; font-weight:700; }
.cardhead em { font-style:normal; color:var(--muted); }
.delta { margin-left:auto; padding:3px 9px; border-radius:999px; font-weight:800; font-size:12px; }
.delta.good { background:rgba(47,210,127,.16); color:var(--ok); }
.delta.bad { background:rgba(255,45,85,.16); color:var(--err); }
.delta.same { background:rgba(255,255,255,.06); color:var(--muted); }
.pair { display:flex; gap:10px; }
.half { position:relative; }
.tag { position:absolute; z-index:2; left:8px; top:8px; padding:3px 7px; border-radius:6px; font-size:10px; font-weight:800; letter-spacing:.1em; color:#fff; }
.tag.before { background:rgba(255,45,85,.92); } .tag.after { background:rgba(22,163,74,.95); }
</style></head><body>
<header>
  <div>
    <div class="brand">${markSvg(46)}<div><div class="title">Mantis<small>before / after</small></div>
    <div class="sub"><code>${escapeHtml(before.url)}</code> ${formatLocalTime(before.startedAt)} &rarr; <code>${escapeHtml(after.url)}</code> ${formatLocalTime(after.startedAt)}</div></div></div>
    <div class="spectrum">${SPECTRUM.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
  </div>
  <div class="totals">${totals}</div>
</header>
${sections.join('')}
<footer><div><b>mantis</b> proof · before ${escapeHtml(before.runId)} · after ${escapeHtml(after.runId)}</div><div>${as.errors === 0 ? 'all error-level issues resolved' : `${as.errors} error-level issue${as.errors === 1 ? '' : 's'} remaining`}</div></footer>
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

/** Record the scripted visit: load, scroll down and up, switch to the dark scheme. */
async function recordVisit(browser, url, label, viewport, dir) {
  const cell = { viewport, scheme: 'light', locale: 'en' };
  const context = await browser.newContext({
    ...contextOptions(cell),
    reducedMotion: 'no-preference',
    recordVideo: { dir, size: { width: viewport.width, height: viewport.height } },
  });
  const page = await context.newPage();
  await page.addInitScript((label) => {
    if (window !== window.top) return;
    const add = () => {
      if (document.getElementById('__mantis_video_label')) return;
      const host = document.createElement('div');
      host.id = '__mantis_video_label';
      host.style.cssText = 'all:initial;position:fixed;left:10px;top:10px;z-index:2147483647;pointer-events:none;';
      const root = host.attachShadow({ mode: 'closed' });
      const ok = label === 'AFTER';
      root.innerHTML = `<div style="font:800 13px/1 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;letter-spacing:.12em;color:#fff;background:${ok ? 'rgba(22,163,74,.95)' : 'rgba(255,45,85,.95)'};padding:7px 10px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,.35)">${label}</div>`;
      document.documentElement.appendChild(host);
    };
    if (document.documentElement) add();
    document.addEventListener('DOMContentLoaded', add);
  }, label);
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
    await page.waitForTimeout(1600);
  } finally {
    await context.close();
  }
  const video = page.video();
  return video ? video.path() : null;
}

/**
 * Record both URLs and compose a side-by-side MP4 (before left, after right) with ffmpeg hstack.
 * Returns null (and logs why) when ffmpeg is not available; the raw .webm files are kept then.
 */
export async function proofVideo(browser, opts, log) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'mantis-video-'));
  try {
    const beforeWebm = await recordVisit(browser, opts.beforeUrl, 'BEFORE', opts.viewport, path.join(tmp, 'before'));
    const afterWebm = await recordVisit(browser, opts.afterUrl, 'AFTER', opts.viewport, path.join(tmp, 'after'));
    const out = path.resolve(opts.videoOut);
    await mkdir(path.dirname(out), { recursive: true });
    if (!(await hasFfmpeg())) {
      const keep = out.replace(/\.mp4$/i, '');
      await rename(beforeWebm, `${keep}.before.webm`);
      await rename(afterWebm, `${keep}.after.webm`);
      log(`ffmpeg not found: skipped the side-by-side MP4 (kept ${path.basename(keep)}.before.webm / .after.webm)`);
      return null;
    }
    const { width, height } = opts.viewport;
    const w = width % 2 ? width + 1 : width;
    const h = height % 2 ? height + 1 : height;
    const filter = `[0:v]scale=${w}:${h},setsar=1,fps=25[a];[1:v]scale=${w}:${h},setsar=1,fps=25[b];[a][b]hstack=inputs=2,pad=iw+24:ih+24:12:12:color=0x0a0c12[v]`;
    const base = ['-y', '-hide_banner', '-loglevel', 'error', '-i', beforeWebm, '-i', afterWebm, '-filter_complex', filter, '-map', '[v]', '-an'];
    let r = await run('ffmpeg', [...base, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out]);
    if (r.code !== 0) r = await run('ffmpeg', [...base, '-c:v', 'mpeg4', '-q:v', '3', out]);
    if (r.code !== 0) throw new Error(`ffmpeg failed: ${firstLine(r.stderr)}`);
    return out;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/**
 * `mantis proof`: before/after PNG sheet from two runs, and optionally a side-by-side video.
 * @param {import('./options.js').ProofOptions} opts
 */
export async function proof(opts, { log = () => {} } = {}) {
  const result = { png: null, video: null };
  let beforeDir = null;
  let afterDir = null;
  if (opts.before) {
    beforeDir = await resolveRunDir(opts.before);
    afterDir = await resolveRunDir(opts.after);
  }
  const browser = await launchBrowser();
  try {
    if (beforeDir) {
      const [before, after] = await Promise.all([loadReport(beforeDir), loadReport(afterDir)]);
      const out = path.resolve(opts.out);
      await mkdir(path.dirname(out), { recursive: true });
      const html = proofHtml(before, after, beforeDir, afterDir);
      await renderHtmlToPng(browser, html, path.join(path.dirname(out), `.mantis-proof-${process.pid}.html`), out);
      result.png = out;
      result.before = { dir: beforeDir, errors: before.summary.errors, warnings: before.summary.warnings };
      result.after = { dir: afterDir, errors: after.summary.errors, warnings: after.summary.warnings };
    }
    if (opts.video) result.video = await proofVideo(browser, opts, log);
  } finally {
    await browser.close().catch(() => {});
  }
  return result;
}
