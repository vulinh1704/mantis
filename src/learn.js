import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installMantisLib } from './inpage/lib.js';
import { collectStyle } from './inpage/style.js';
import { launchBrowser, preflight } from './look.js';
import { readStorageState, storageStateName } from './options.js';
import { applyDarkStrategy, contextOptions, finishAnimations, fontsReady, nextFrames, prescroll, settle } from './page.js';
import { projectInfo } from './project.js';
import { buildStyle, renderStyleMarkdown } from './style.js';
import { renderStyleSheet } from './style-sheet.js';
import { VERSION, firstLine, pool } from './util.js';

/** Open one screen and collect the style values it uses. Motion is not reduced, so durations show. */
async function learnCell(browser, opts, cell, session) {
  const context = await browser.newContext({ ...contextOptions(cell, session), reducedMotion: 'no-preference' });
  context.setDefaultTimeout(opts.timeout);
  const page = await context.newPage();
  try {
    const response = await page.goto(cell.url, { waitUntil: 'load', timeout: opts.timeout });
    if (response && response.status() >= 400) return { ...cell, error: `HTTP ${response.status()}` };
    await settle(page, { wait: opts.wait });
    await applyDarkStrategy(page, opts.darkStrategy, cell.scheme);
    await prescroll(page);
    await fontsReady(page);
    await finishAnimations(page);
    await nextFrames(page);
    await page.evaluate(installMantisLib, { ignore: opts.ignore || [] });
    return { ...cell, data: await page.evaluate(collectStyle, {}) };
  } catch (err) {
    return { ...cell, error: firstLine(err.message) };
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * `mantis learn`: measure the house style of the running app on every route x viewport x scheme
 * and write `<out>/style.json`, `style.md` and `style.png`.
 * @param {import('./options.js').LearnOptions} opts
 */
export async function learn(opts, { log = () => {} } = {}) {
  const startedAt = new Date();
  const session = opts.storageState ? await readStorageState(opts.storageState) : null;
  const browser = await launchBrowser();
  try {
    await preflight(browser, new URL(opts.routes[0], opts.baseUrl).href, session);
    const cells = [];
    for (const route of opts.routes) {
      for (const viewport of opts.viewports) {
        for (const scheme of opts.schemes) {
          cells.push({ route, viewport, scheme, locale: 'en', url: new URL(route, opts.baseUrl).href });
        }
      }
    }
    let done = 0;
    const results = [];
    await pool(cells, opts.concurrency, async (cell, i) => {
      const r = await learnCell(browser, opts, cell, session);
      results[i] = r;
      done++;
      const status = r.error ? `failed: ${r.error}` : `${r.data.elements} elements`;
      log(`[${String(done).padStart(String(cells.length).length)}/${cells.length}] ${cell.route} ${cell.viewport.name} ${cell.scheme}  ${status}`);
    });
    const ok = results.filter((r) => !r.error);
    if (!ok.length) throw new Error(`no screen could be measured (${results[0]?.error ?? 'unknown error'})`);
    const style = buildStyle(
      ok.map((r) => ({ route: r.route, viewport: r.viewport.name, scheme: r.scheme, data: r.data })),
      {
        url: opts.url,
        routes: opts.routes,
        viewports: opts.viewports.map((v) => v.name),
        schemes: opts.schemes,
        storageState: storageStateName(opts.storageState),
        version: VERSION,
        learnedAt: startedAt,
      },
    );
    for (const r of results.filter((x) => x.error)) style.notes.push(`${r.route} ${r.viewport.name} ${r.scheme} could not be measured: ${r.error}.`);

    const outDir = path.resolve(opts.out);
    await mkdir(outDir, { recursive: true });
    const files = {
      json: path.join(outDir, 'style.json'),
      md: path.join(outDir, 'style.md'),
      png: path.join(outDir, 'style.png'),
    };
    await writeFile(files.json, JSON.stringify(style, null, 2) + '\n');
    await writeFile(files.md, renderStyleMarkdown(style));
    try {
      await renderStyleSheet(browser, style, projectInfo(), files.png);
    } catch (err) {
      log(`! style sheet failed: ${firstLine(err.message)}`);
      files.png = null;
    }
    return { style, files };
  } finally {
    await browser.close().catch(() => {});
  }
}
