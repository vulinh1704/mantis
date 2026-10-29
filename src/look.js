import { existsSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright';
import { annotate } from './annotate.js';
import { baselineTargets, comparable, compareCell, findBaseline, issueSelectors, stateKey, summarize } from './compare.js';
import { renderContactSheet } from './contact-sheet.js';
import { CELL_DETECTORS, CROSS_DETECTORS } from './detectors/index.js';
import { installMantisLib } from './inpage/lib.js';
import { collectState } from './inpage/state.js';
import { UsageError, formatDarkStrategy, readStorageState, routeSlug } from './options.js';
import {
  applyDarkStrategy,
  contextOptions,
  finishAnimations,
  fontsReady,
  nextFrames,
  pageText,
  prescroll,
  settle,
  trackConsole,
  trackNetwork,
  waitForQuiet,
} from './page.js';
import { IssueRegistry, buildReport, renderMarkdown } from './report.js';
import { projectInfo } from './project.js';
import { VERSION, deferred, firstLine, pool, runIdFor, sha1, uniqueDir } from './util.js';

/** The URL could not be reached at all (exit code 2). */
export class UnreachableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnreachableError';
  }
}

/** Playwright's Chromium is missing or cannot start (exit code 2). */
export class BrowserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BrowserError';
  }
}

const MAX_SHOT_HEIGHT = 16000;

/** `npx playwright@<the version Mantis uses>` so the installed browser build matches. */
function playwrightCommand() {
  try {
    const v = createRequire(import.meta.url)('playwright/package.json').version;
    return `npx -y playwright@${v}`;
  } catch {
    return 'npx playwright';
  }
}

export async function launchBrowser() {
  try {
    return await chromium.launch({ headless: true });
  } catch (err) {
    const msg = String(err && err.message);
    if (/Executable doesn't exist|npx playwright install/i.test(msg) && !/install-deps/i.test(msg)) {
      throw new BrowserError(`Chromium for Playwright is not installed. Run: ${playwrightCommand()} install chromium`);
    }
    if (/missing dependencies|install-deps|error while loading shared libraries/i.test(msg)) {
      throw new BrowserError(`Chromium cannot start: system libraries are missing. Run: ${playwrightCommand()} install-deps chromium\n${firstLine(msg)}`);
    }
    throw new BrowserError(`Chromium failed to launch: ${firstLine(msg)}`);
  }
}

async function preflight(browser, url, session) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, ...(session ? { storageState: session } : {}) });
  try {
    await context.request.get(url, { timeout: 20000, failOnStatusCode: false, maxRedirects: 10 });
  } catch (err) {
    throw new UnreachableError(`cannot reach ${url}: ${firstLine(err.message)}${containerHint(url)}`);
  } finally {
    await context.close().catch(() => {});
  }
}

/**
 * Inside a container, localhost is the container itself. Say how to reach a dev server on the host.
 * @param {string} url
 * @param {boolean} [inContainer]
 */
export function containerHint(url, inContainer = existsSync('/.dockerenv')) {
  const u = new URL(url);
  if (!inContainer || !/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(u.hostname)) return '';
  const viaHost = new URL(url);
  viaHost.hostname = 'host.docker.internal';
  return `\nInside Docker, ${u.hostname} is the container itself. With Docker Desktop (Mac, Windows) use ${viaHost.href}; on Linux, run the container with --network host.`;
}

async function fullPageShot(page, file) {
  const size = await page.evaluate(() => ({
    w: Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0),
    h: Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0),
  }));
  const opts = { path: file, fullPage: true, animations: 'disabled', caret: 'hide', timeout: 60000 };
  if (size.h > MAX_SHOT_HEIGHT) opts.clip = { x: 0, y: 0, width: size.w, height: MAX_SHOT_HEIGHT };
  await page.screenshot(opts);
  return { clipped: size.h > MAX_SHOT_HEIGHT, width: size.w };
}

function documentFailure(url, reason, status = null) {
  return {
    type: 'request-failed',
    severity: 'error',
    key: 'document',
    selector: null,
    rect: null,
    message: `The page itself failed to load: ${reason}.`,
    evidence: { url, status, document: true },
  };
}

const probeTargets = (raws) => raws.flatMap((r) => issueSelectors(r.selector, r.evidence).map((s) => ({ s })));

/**
 * Open one cell (route x viewport x scheme x locale), let it settle and run the per-cell detectors,
 * then capture the cell's state (probes of `targets` and of its own issues, plus the inventory).
 * The page is left open: the caller annotates it, takes the screenshot and closes the context.
 */
async function runCell(browser, opts, cell, baseline, targets, session, log) {
  const info = {
    id: cell.id,
    key: `${cell.viewport.name}/${cell.scheme}/${cell.locale}`,
    route: cell.route,
    viewport: cell.viewport.name,
    width: cell.viewport.width,
    height: cell.viewport.height,
    scheme: cell.scheme,
    locale: cell.locale,
    url: cell.url,
    status: 'ok',
    httpStatus: null,
    title: null,
    screenshot: null,
    cls: null,
    notes: [],
  };
  const out = { info, page: null, context: null, raw: [], snapshots: {}, state: null };
  const context = await browser.newContext(contextOptions(cell, session));
  context.setDefaultTimeout(opts.timeout);
  const page = await context.newPage();
  out.context = context;
  out.page = page;
  const ctx = {
    url: cell.url,
    cell,
    cellInfo: info,
    options: opts,
    network: trackNetwork(page),
    console: trackConsole(page),
  };
  try {
    for (const d of CELL_DETECTORS) if (d.setup) await d.setup(page, ctx);

    let response;
    try {
      response = await page.goto(cell.url, { waitUntil: 'load', timeout: opts.timeout });
    } catch (err) {
      info.status = 'failed';
      out.raw.push(documentFailure(cell.url, firstLine(err.message)));
      return out;
    }
    info.httpStatus = response ? response.status() : null;
    try {
      info.notes.push(...(await settle(page, { wait: opts.wait })));
      if (response && response.status() >= 400) {
        info.status = 'failed';
        out.raw.push(documentFailure(cell.url, `HTTP ${response.status()}`, response.status()));
        return out;
      }
      await applyDarkStrategy(page, opts.darkStrategy, cell.scheme);
      info.title = await page.title().catch(() => null);

      // Untranslated locale cells: compare the visible text with the first locale's cell.
      const textHash = sha1(await pageText(page));
      if (cell.localeIndex === 0) {
        baseline.resolve(textHash);
      } else {
        const base = await baseline.promise;
        if (base && base === textHash) {
          info.status = 'not-localized';
          await finishAnimations(page);
          return out;
        }
      }

      const libOptions = { ignore: opts.ignore || [] };
      await page.evaluate(installMantisLib, libOptions);
      const runPhase = async (phase) => {
        for (const d of CELL_DETECTORS) {
          if (d.phase !== phase || (d.applies && !d.applies(ctx))) continue;
          try {
            out.raw.push(...(await d.run(page, ctx)));
          } catch (err) {
            if (page.isClosed() || /Execution context was destroyed|Target .*closed/i.test(err.message)) throw err;
            info.notes.push(`detector ${d.name} failed: ${firstLine(err.message)}`);
            log(`  ! ${d.name} failed on ${info.id}: ${firstLine(err.message)}`);
          }
        }
      };
      await runPhase('load');
      await prescroll(page);
      await waitForQuiet(page, ctx.network);
      await fontsReady(page);
      await finishAnimations(page);
      await nextFrames(page);
      await page.evaluate(installMantisLib, libOptions);
      await runPhase('dom');
      await runPhase('final');
      for (const d of CROSS_DETECTORS) {
        try {
          out.snapshots[d.name] = await d.collect(page, ctx);
        } catch (err) {
          info.notes.push(`detector ${d.name} failed: ${firstLine(err.message)}`);
        }
      }
      try {
        out.state = await page.evaluate(collectState, { targets: [...probeTargets(out.raw), ...targets] });
      } catch (err) {
        if (page.isClosed() || /Execution context was destroyed|Target .*closed/i.test(err.message)) throw err;
        info.notes.push(`state capture failed: ${firstLine(err.message)}`);
      }
      return out;
    } catch (err) {
      // Typically the page navigated by itself (client-side redirect) while being analysed.
      info.status = 'failed';
      info.crashed = true;
      info.notes.push(`analysis aborted: ${firstLine(err.message)}${/Execution context was destroyed/i.test(err.message) ? ' (the page navigated away, e.g. a client-side redirect)' : ''}`);
      out.raw = [];
      out.snapshots = {};
      out.state = null;
      return out;
    }
  } finally {
    if (cell.localeIndex === 0) baseline.resolve(null);
  }
}

/**
 * Run the full matrix and write the report.
 * @param {import('./options.js').LookOptions} opts
 * @param {{log?: (line: string) => void}} [io]
 * @returns {Promise<{report: object, runDir: string, latestDir: string, exitCode: number}>}
 */
export async function look(opts, { log = () => {} } = {}) {
  const startedAt = new Date();
  const session = opts.storageState ? await readStorageState(opts.storageState) : null;
  const base = await findBaseline(opts);
  const browser = await launchBrowser();
  try {
    if (opts.ignore && opts.ignore.length) {
      const probe = await browser.newPage();
      const invalid = await probe.evaluate((sels) => sels.filter((s) => {
        try {
          document.querySelector(s);
          return false;
        } catch {
          return true;
        }
      }), opts.ignore);
      await probe.close();
      if (invalid.length) throw new UsageError(`invalid --ignore selector: ${invalid.join(' | ')}`);
    }
    await preflight(browser, new URL(opts.routes[0], opts.baseUrl).href, session);

    const outDir = path.resolve(opts.out);
    const runDir = await uniqueDir(path.join(outDir, 'runs'), runIdFor(startedAt));
    const runId = path.basename(runDir);
    const shotsDir = path.join(runDir, 'shots');
    await mkdir(shotsDir, { recursive: true });

    // Unique slug per route for file names.
    const slugs = new Map();
    const used = new Set();
    for (const r of opts.routes) {
      let s = routeSlug(r);
      for (let i = 2; used.has(s); i++) s = `${routeSlug(r)}-${i}`;
      used.add(s);
      slugs.set(r, s);
    }

    // Groups = route x locale x viewport (all schemes of a group run together for theme-leak).
    const groups = [];
    for (const route of opts.routes) {
      opts.locales.forEach((locale, localeIndex) => {
        for (const viewport of opts.viewports) groups.push({ route, locale, localeIndex, viewport });
      });
    }
    const baselines = new Map();
    for (const route of opts.routes) {
      for (const v of opts.viewports) for (const s of opts.schemes) baselines.set(`${route}|${v.name}|${s}`, deferred());
    }
    const turns = groups.map(() => deferred());
    const registry = new IssueRegistry();
    const cellInfos = new Map();
    const noEffect = new Map(); // route -> Set of "viewport/locale" where dark had no effect
    const state = { tool: 'mantis', version: VERSION, runId, cells: {} };
    const compared = new Set();
    const total = groups.length * opts.schemes.length;
    let done = 0;

    await pool(groups, opts.concurrency, async (g, gi) => {
      let results = [];
      try {
        results = await Promise.all(opts.schemes.map((scheme) => {
          const cell = {
            id: `${slugs.get(g.route)}__${g.viewport.name}__${scheme}__${g.locale}`,
            route: g.route,
            url: new URL(g.route, opts.baseUrl).href,
            viewport: g.viewport,
            scheme,
            locale: g.locale,
            localeIndex: g.localeIndex,
          };
          const targets = base ? baselineTargets(base, g.route, `${g.viewport.name}/${scheme}/${g.locale}`) : [];
          return runCell(browser, opts, cell, baselines.get(`${g.route}|${g.viewport.name}|${scheme}`), targets, session, log);
        }));

        const light = results.find((r) => r.info.scheme === 'light' && r.info.status === 'ok');
        const dark = results.find((r) => r.info.scheme === 'dark' && r.info.status === 'ok');
        if (light && dark) {
          for (const d of CROSS_DETECTORS) {
            const a = light.snapshots[d.name];
            const b = dark.snapshots[d.name];
            if (!a || !b) continue;
            try {
              const cmp = d.compare(a, b);
              if (process.env.MANTIS_DEBUG) {
                log(`  [debug] ${d.name} ${g.route} ${g.viewport.name}/${g.locale}: flipped=${cmp.flipped} light=${cmp.lightBg} dark=${cmp.darkBg} findings=${JSON.stringify(cmp.findings.map((f) => [f.kind, f.key]))}`);
              }
              if (!cmp.flipped && cmp.unchanged) {
                if (!noEffect.has(g.route)) noEffect.set(g.route, { bg: cmp.lightBg, where: new Set() });
                noEffect.get(g.route).where.add(`${g.viewport.name}/${g.locale}`);
              }
              const found = await d.resolve(dark.page, cmp.findings);
              dark.raw.push(...found);
              if (dark.state && found.length) {
                Object.assign(dark.state.probes, (await dark.page.evaluate(collectState, { targets: probeTargets(found), inventory: false })).probes);
              }
            } catch (err) {
              dark.info.notes.push(`detector ${d.name} failed: ${firstLine(err.message)}`);
            }
          }
        }
      } finally {
        if (gi > 0) await turns[gi - 1].promise;
        for (const r of results) {
          if (!r.state) continue;
          const key = stateKey(g.route, r.info.key);
          state.cells[key] = r.state;
          if (!base || !comparable(base, r.info)) continue;
          try {
            r.raw.push(...compareCell({ route: g.route, cell: r.info.key, raw: r.raw, after: r.state, base }));
            compared.add(key);
          } catch (err) {
            r.info.notes.push(`comparison with the baseline failed: ${firstLine(err.message)}`);
          }
        }
        // Register in a fixed order so issue numbers do not depend on timing.
        for (const r of results) {
          const shot = `shots/${r.info.id}.png`;
          const items = new Map();
          for (const raw of r.raw) {
            const { extraRects, ...clean } = raw;
            const issue = registry.add(g.route, r.info.key, clean, raw.rect ? shot : null);
            // Grouped issues (same root cause in many elements) outline every element with the same number.
            for (const rect of [raw.rect, ...(extraRects || [])]) {
              if (!rect) continue;
              const k = `${issue.id}:${rect.x},${rect.y},${rect.width},${rect.height}`;
              if (!items.has(k)) items.set(k, { n: issue.id, severity: raw.severity, rect });
            }
          }
          r.items = [...items.values()];
        }
        turns[gi].resolve(true);
      }

      for (const r of results) {
        const file = path.join(shotsDir, `${r.info.id}.png`);
        try {
          if (r.page && !r.page.isClosed() && r.info.httpStatus !== null) {
            await r.page.evaluate(() => window.scrollTo({ left: 0, top: 0, behavior: 'instant' }));
            if (r.items.length) await annotate(r.page, r.items);
            const shot = await fullPageShot(r.page, file);
            r.info.screenshot = `shots/${r.info.id}.png`;
            r.info.shotWidth = shot.width;
            if (shot.clipped) r.info.notes.push(`screenshot truncated at ${MAX_SHOT_HEIGHT}px`);
          }
        } catch (err) {
          r.info.notes.push(`screenshot failed: ${firstLine(err.message)}`);
        } finally {
          await r.context?.close().catch(() => {});
        }
        cellInfos.set(r.info.id, r.info);
        done++;
        const e = r.raw.filter((x) => x.severity === 'error').length;
        const w = r.raw.length - e;
        const status = r.info.status === 'ok' ? `${e} error${e === 1 ? '' : 's'}, ${w} warning${w === 1 ? '' : 's'}` : r.info.status;
        log(`[${String(done).padStart(String(total).length)}/${total}] ${r.info.route} ${r.info.viewport} ${r.info.scheme} ${r.info.locale}  ${status}`);
      }
    });

    // Cells in matrix order.
    const cells = [];
    for (const route of opts.routes) {
      for (const locale of opts.locales) {
        for (const v of opts.viewports) {
          for (const s of opts.schemes) {
            const info = cellInfos.get(`${slugs.get(route)}__${v.name}__${s}__${locale}`);
            if (info) cells.push(info);
          }
        }
      }
    }

    const notes = [];
    for (const route of opts.routes) {
      for (const locale of opts.locales.slice(1)) {
        const nl = cells.filter((c) => c.route === route && c.locale === locale && c.status === 'not-localized');
        if (nl.length) {
          const all = cells.filter((c) => c.route === route && c.locale === locale).length;
          notes.push(`\`${route}\` · ${locale}: not localized — page text is identical to ${opts.locales[0]} in ${nl.length === all ? 'every cell' : `${nl.length} of ${all} cells`}; detectors were not re-run there.`);
        }
      }
      const ne = noEffect.get(route);
      if (ne) {
        notes.push(`\`${route}\`: the dark scheme did not change the page background (${ne.bg}) at ${[...ne.where].join(', ')} — dark mode is missing, or it is toggled by a class/attribute (try --dark-strategy class:dark or attr:data-theme=dark).`);
      }
    }
    for (const c of cells) {
      for (const n of c.notes) notes.push(`\`${c.route}\` ${c.key}: ${n}`);
    }
    let baseline = null;
    if (base) {
      baseline = { ...summarize(base, registry, compared), dir: path.relative(outDir, base.dir) || base.dir };
      if (!compared.size) notes.push(`Baseline run ${base.report.runId} has no cell in common with this run (same route, viewport size, scheme and locale), so nothing was compared.`);
    }

    const report = buildReport({
      version: VERSION,
      runId,
      startedAt,
      finishedAt: new Date(),
      options: { ...opts, darkStrategyText: formatDarkStrategy(opts.darkStrategy) },
      cells,
      issues: registry.issues,
      notes,
      baseline,
      project: projectInfo(),
    });
    await writeFile(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(path.join(runDir, 'state.json'), JSON.stringify(state) + '\n');
    await writeFile(path.join(runDir, 'report.md'), renderMarkdown(report));
    try {
      await renderContactSheet(browser, report, runDir);
    } catch (err) {
      log(`! contact sheet failed: ${firstLine(err.message)}`);
    }
    const latestDir = path.join(outDir, 'latest');
    await rm(latestDir, { recursive: true, force: true });
    await cp(runDir, latestDir, { recursive: true });
    return { report, runDir, latestDir, exitCode: report.summary.exitCode };
  } finally {
    await browser.close().catch(() => {});
  }
}
