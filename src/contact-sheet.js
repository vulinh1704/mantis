import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { formatLocalTime } from './report.js';
import { BASE_CSS, MOON, SPECTRUM, SUN, badgesHtml, escapeHtml, markSvg } from './sheet-style.js';

const TILE_H = 300;

/**
 * Contact sheet HTML: rows = route + locale, columns = viewport x scheme, each tile showing the
 * first screen of the annotated screenshot with an error/warning badge.
 * @param {object} report  report.json object
 */
export function contactSheetHtml(report) {
  const m = report.matrix;
  const cols = [];
  for (const v of m.viewports) {
    for (const s of m.schemes) cols.push({ v, s, w: Math.max(110, Math.round((TILE_H * v.width) / v.height)) });
  }
  const s = report.summary;
  const stats = [
    `<div class="stat ${s.errors ? 'err' : 'ok'}"><b>${s.errors}</b><span>error${s.errors === 1 ? '' : 's'}</span></div>`,
    `<div class="stat ${s.warnings ? 'warn' : 'ok'}"><b>${s.warnings}</b><span>warning${s.warnings === 1 ? '' : 's'}</span></div>`,
    `<div class="stat"><b>${s.cells}</b><span>cells</span></div>`,
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
        rows.push(`<div class="shot${dim}" style="width:${c.w}px;height:${TILE_H}px">${img}${badgesHtml(cell)}${stamp}</div>`);
      }
    }
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Mantis contact sheet</title><style>${BASE_CSS}
.grid { display:grid; grid-template-columns: 170px ${cols.map((c) => `${c.w}px`).join(' ')}; gap:16px 16px; align-items:start; }
.grid > .colhead { padding-bottom:2px; }
</style></head><body>
<header>
  <div>
    <div class="brand">${markSvg(46)}<div><div class="title">Mantis<small>UI sweep</small></div>
    <div class="sub"><code>${escapeHtml(report.url)}</code> · ${escapeHtml(formatLocalTime(report.startedAt))}</div></div></div>
    <div class="spectrum">${SPECTRUM.map((c) => `<i style="background:${c}"></i>`).join('')}</div>
  </div>
  <div class="totals">${stats}</div>
</header>
<div class="grid"><div></div>${colHeads}${rows.join('')}</div>
<footer><div><b>mantis</b> · sees 12 color channels. you see 3. your agent sees 0.</div><div>run ${escapeHtml(report.runId)} · dark strategy ${escapeHtml(m.darkStrategy)} · ${(report.durationMs / 1000).toFixed(1)}s</div></footer>
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
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: 'dark' });
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
