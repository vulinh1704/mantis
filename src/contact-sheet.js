import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatLocalTime } from './report.js';
import {
  BASE_CSS, MOON, SUN, badgesHtml, escapeHtml, footerHtml, headerHtml, brandStyle, pickSignature, plural, roundStamp, scribbleHtml, statCard, thumbRect,
} from './sheet-style.js';

const TILE_H = 300;

/** "2 routes × 3 viewports × light/dark × en, vi" */
export function matrixText(m) {
  return [
    plural(m.routes.length, 'route'),
    plural(m.viewports.length, 'viewport'),
    m.schemes.join('/'),
    m.locales.join(', '),
  ].join(' × ');
}

function summaryText(report) {
  const s = report.summary;
  const found = s.errors || s.warnings
    ? `<strong class="${s.errors ? 'err' : 'warn'}">${plural(s.errors, 'error')}</strong> and ${plural(s.warnings, 'warning')} across ${s.cells} cells`
    : `<strong class="ok">No issues</strong> in ${s.cells} cells`;
  let text = `${found}: ${escapeHtml(matrixText(report.matrix))}.`;
  const b = report.baseline;
  if (b) text += ` Since the last run: ${b.fixed.length} fixed, ${b.new.length} new, <strong class="${b.coverUps ? 'err' : 'ok'}">${plural(b.coverUps, 'cover-up')}</strong>.`;
  return text;
}

/**
 * Contact sheet HTML: rows = route + locale, columns = viewport x scheme, each tile showing the
 * first screen of the annotated screenshot with its error/warning badges. The most telling
 * finding gets a hand-drawn circle.
 * @param {object} report  report.json object
 */
export function contactSheetHtml(report) {
  const m = report.matrix;
  const cols = [];
  for (const v of m.viewports) {
    for (const s of m.schemes) cols.push({ v, s, w: Math.max(110, Math.round((TILE_H * v.width) / v.height)) });
  }
  const widthOf = (cell) => cols.find((c) => c.v.name === cell.viewport && c.s === cell.scheme)?.w ?? 0;
  const sig = pickSignature(report, (cell, rect) => !!thumbRect(cell, rect, widthOf(cell), TILE_H));

  const s = report.summary;
  const stats = [
    statCard(s.errors, s.errors === 1 ? 'error' : 'errors', { tone: s.errors ? 'err' : 'ok', note: s.errors ? 'needs a fix' : 'clean' }),
    statCard(s.warnings, s.warnings === 1 ? 'warning' : 'warnings', { tone: s.warnings ? 'warn' : 'ok', note: s.warnings ? 'worth a look' : 'none' }),
    statCard(s.cells, 'cells', { note: `${m.viewports.length} × ${m.schemes.length} × ${m.locales.length * m.routes.length}` }),
  ].join('');

  const colHeads = cols
    .map((c) => `<div class="colhead"><div class="ch1">${c.s === 'dark' ? MOON : SUN}${escapeHtml(c.v.name)}</div><em>${c.v.width}&times;${c.v.height} · ${c.s}</em></div>`)
    .join('');

  const rows = [];
  for (const route of m.routes) {
    for (const loc of m.locales) {
      rows.push(`<div class="rowhead"><div class="route">${escapeHtml(route)}</div><div class="loc">${escapeHtml(loc.toUpperCase())}</div></div>`);
      for (const c of cols) {
        const cell = report.cells.find((x) => x.route === route && x.locale === loc && x.viewport === c.v.name && x.scheme === c.s);
        const dim = cell && cell.status !== 'ok' ? ' dim' : '';
        const img = cell && cell.screenshot ? `<img src="${escapeHtml(cell.screenshot)}" alt="">` : '';
        let stamp = '';
        if (cell && cell.status === 'not-localized') stamp = `<div class="stamp">not localized · same text as ${escapeHtml(m.locales[0])}</div>`;
        if (cell && cell.status === 'failed') stamp = `<div class="stamp">failed to load</div>`;
        if (!cell) stamp = '<div class="stamp">not run</div>';
        let mark = '';
        if (sig && cell === sig.cell) {
          const note = sig.issue.type === 'cover-up' ? 'hidden, not fixed' : `found at ${cell.width} px`;
          mark = scribbleHtml(thumbRect(cell, sig.rect, c.w, TILE_H), c.w, TILE_H, note);
        }
        rows.push(`<div class="shot${dim}" style="width:${c.w}px;height:${TILE_H}px">${img}${mark}${badgesHtml(cell)}${stamp}</div>`);
      }
    }
  }

  const project = report.project ?? null;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mantis contact sheet</title><style>${BASE_CSS}
.grid { display:grid; grid-template-columns: 180px ${cols.map((c) => `${c.w}px`).join(' ')}; gap:18px 18px; align-items:start; }
.grid > .colhead { padding-bottom:4px; }
</style></head><body${brandStyle(project)}>
${headerHtml({
    project,
    url: report.url,
    title: 'Field report',
    round: roundStamp(1, 'Detect'),
    summary: summaryText(report),
    meta: `${escapeHtml(report.url)} · ${escapeHtml(formatLocalTime(report.startedAt))} · run ${escapeHtml(report.runId)}`,
    stats,
  })}
<div class="grid"><div></div>${colHeads}${rows.join('')}</div>
${footerHtml(`dark strategy ${escapeHtml(m.darkStrategy)} · ${(report.durationMs / 1000).toFixed(1)}s`)}
</body></html>`;
}

/**
 * Render an HTML file next to the images it references and screenshot it to `outPng`.
 * @param {import('playwright').Browser} browser
 * @param {string} html
 * @param {string} htmlPath  where to write the temporary HTML (relative image URLs resolve from here)
 * @param {string} outPng
 */
export async function renderHtmlToPng(browser, html, htmlPath, outPng) {
  await writeFile(htmlPath, html);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const width = await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().width));
    await page.setViewportSize({ width, height: 800 });
    await page.screenshot({ path: outPng, fullPage: true, timeout: 60000 });
  } finally {
    await context.close();
    await rm(htmlPath, { force: true });
  }
}

/** Write `<runDir>/contact-sheet.png`. */
export async function renderContactSheet(browser, report, runDir) {
  const out = path.join(runDir, 'contact-sheet.png');
  await renderHtmlToPng(browser, contactSheetHtml(report), path.join(runDir, '.contact-sheet.html'), out);
  return out;
}
