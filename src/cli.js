import path from 'node:path';
import { learn } from './learn.js';
import { BrowserError, UnreachableError, look } from './look.js';
import { UsageError, parseLearnArgs, parseLookArgs, parsePerfArgs, parseProofArgs } from './options.js';
import { savingLabel } from './perf/findings.js';
import { fmtKb, fmtMs, perf } from './perf/index.js';
import { styleCounts } from './style.js';
import { proof } from './proof.js';
import { VERSION } from './util.js';

export const HELP = `mantis ${VERSION} — catches the UI bugs your coding agent can't see, and the ones it hides

Usage
  mantis look <url> [options]
  mantis learn <url> [options]
  mantis perf <url> [options]
  mantis proof --before <runDir> --after <runDir> [--out <file.png>]
               [--video --before-url <url> --after-url <url> [--viewport mobile]
                [--dark-strategy media|class:dark|attr:data-theme=dark]
                [--storage-state <file>]]

look: open <url> in Chromium for every route x viewport x scheme x locale, detect
problems (overflow, clipped text, overlaps, contrast, dark-mode leaks, small tap
targets, console errors, failed requests, broken images, layout shift) and write
<out>/runs/<timestamp>/{report.md,report.json,contact-sheet.png,shots/} plus a copy
in <out>/latest.

  --routes /,/settings         routes to visit (default: the URL's own path)
  --viewports mobile,tablet,desktop
                               presets mobile 360x740, tablet 768x1024,
                               desktop 1440x900, or WxH / name=WxH
  --schemes light,dark         color schemes (default both)
  --locales en,vi              locales (default en); a locale whose page text is
                               identical to the first one is marked "not localized";
                               "pseudo" rewrites the first language's text ~40% longer,
                               "pseudo-rtl" also lays it out right to left
  --dark-strategy media|class:dark|attr:data-theme=dark
                               how dark mode is switched on (default media)
  --locale-strategy browser|path:/{locale}|query:lang|cookie:NEXT_LOCALE|storage:i18nextLng
                               how the app picks its language, on top of the
                               browser locale and Accept-Language (default browser)
  --out .mantis                output directory
  --wait <ms>                  extra wait after network idle and web fonts
  --json                       print report.json to stdout
  --concurrency <n>            route/viewport groups run in parallel (default 3)
  --timeout <ms>               navigation timeout (default 30000)
  --ignore <selector>          skip matching elements and their subtree in every
                               detector (repeatable); pages can also mark elements
                               with the data-mantis-ignore attribute
  --baseline auto|none|<runDir>
                               run to compare with (default auto: the previous run
                               of the same URL in <out>/runs). An issue that is gone
                               because its element was hidden, removed, shrunk or
                               cut off is a cover-up error; a control or heading
                               that disappeared is a lost warning
  --storage-state <file>       start every cell with the cookies and localStorage of
                               a Playwright storage state file, to look at pages
                               behind a login or onboarding. Make one with
                               npx playwright codegen --save-storage=<file> <url>
                               or write the JSON by hand; keep it out of git
  --style auto|none|<file>     house style to check against (default auto:
                               <out>/style.json when mantis learn wrote one).
                               Colors, font sizes and radii a hair off the house
                               values, and fonts used nowhere else, are off-style
                               warnings

learn: measure the house style of the running app (colors per scheme with their
CSS tokens, font sizes, fonts, weights, radii, spacing, shadows, motion) on every
route x viewport x scheme, and write <out>/style.json, style.md and style.png.
Rarely used values a hair away from a common one are listed as near-duplicates.
Takes the look options except --locales, --baseline, --style and --json.

proof: side-by-side before/after sheet of two runs (run dirs, or the aliases
latest / prev / first under .mantis), written to --out (default .mantis/proof.png),
plus a close-up of one fixed finding at the same coordinates (<out>-zoom.png).
--video records a short visit of both URLs (load, scroll, switch to dark) and
stacks them into one MP4 next to --out (default .mantis/proof.mp4) with ffmpeg,
between a title card and a closing receipt when the two runs are given too;
without ffmpeg the two raw .webm recordings are kept instead.

perf: load every route N times cold in Chromium, throttled like a mid-range phone on
slow 4G (or unthrottled with --profile desktop), and report the median and spread
of LCP, FCP, TBT, CLS, TTFB, load, bytes and requests, with the LCP element, the
slowest requests and the code that made them, the long animation frames and the
scripts that ran in them, and the code that never ran. Then it ranks fixes by
impact and fix risk (do first, plan, nice to have, your call), each with its
culprit (selector, URL or file:line and function), the estimated saving and the
framework's own way to fix it. Writes <out>/perf/runs/<timestamp>/{perf.md,
perf.json} plus a copy in <out>/perf/latest. Exit code 1 when there is something
to do first or to plan. Measure a production build: a dev server's numbers are
not what users get.

  --routes /,/settings         routes to measure (default: the URL's own path)
  --runs <n>                   cold visits per route, 1-15 (default 5)
  --profile mobile|desktop     default mobile
  --out .mantis                output directory
  --timeout <ms>               navigation timeout (default 60000)
  --storage-state <file>       start every visit with this Playwright storage state
  --json                       print perf.json to stdout

Exit codes: 0 no errors · 1 error-level issues found · 2 crash, unreachable URL or bad usage
`;

function rel(p) {
  const r = path.relative(process.cwd(), p);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p;
}

/**
 * Run the CLI. Returns the exit code (the bin script sets process.exitCode).
 * @param {string[]} argv
 * @param {{stdout?: NodeJS.WritableStream, stderr?: NodeJS.WritableStream}} [io]
 */
export async function main(argv = process.argv.slice(2), { stdout = process.stdout, stderr = process.stderr } = {}) {
  const out = (s) => stdout.write(s + '\n');
  const err = (s) => stderr.write(s + '\n');
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') {
    out(HELP);
    return 0;
  }
  if (cmd === '-v' || cmd === '--version' || cmd === 'version') {
    out(VERSION);
    return 0;
  }
  try {
    if (cmd === 'look') {
      if (rest.includes('-h') || rest.includes('--help')) {
        out(HELP);
        return 0;
      }
      const opts = parseLookArgs(rest);
      err(`mantis look ${opts.url} · routes ${opts.routes.join(',')} · ${opts.viewports.map((v) => v.name).join(',')} · ${opts.schemes.join(',')} · ${opts.locales.join(',')}`);
      const res = await look(opts, { log: err });
      if (opts.json) {
        out(JSON.stringify(res.report, null, 2));
      } else {
        const s = res.report.summary;
        const types = Object.entries(s.byType)
          .map(([t, c]) => `${t} ${c.errors + c.warnings}`)
          .join(' · ');
        out('');
        out(`Mantis: ${s.errors} error${s.errors === 1 ? '' : 's'}, ${s.warnings} warning${s.warnings === 1 ? '' : 's'} in ${s.cells} cells${s.failedCells ? ` (${s.failedCells} failed)` : ''}`);
        if (types) out(`  ${types}`);
        const b = res.report.baseline;
        if (b) out(`  vs ${b.runId}: ${b.fixed.length} fixed · ${b.new.length} new · ${b.coverUps} cover-up${b.coverUps === 1 ? '' : 's'} · ${b.lost} lost`);
        out(`  report  ${rel(path.join(res.latestDir, 'report.md'))}`);
        out(`  sheet   ${rel(path.join(res.latestDir, 'contact-sheet.png'))}`);
        out(`  run     ${rel(res.runDir)}`);
      }
      return res.exitCode;
    }
    if (cmd === 'learn') {
      if (rest.includes('-h') || rest.includes('--help')) {
        out(HELP);
        return 0;
      }
      const opts = parseLearnArgs(rest);
      err(`mantis learn ${opts.url} · routes ${opts.routes.join(',')} · ${opts.viewports.map((v) => v.name).join(',')} · ${opts.schemes.join(',')}`);
      const res = await learn(opts, { log: err });
      const s = res.style;
      out('');
      out(`House style: ${styleCounts(s)}`);
      out(`  ${s.drift.length} near-duplicate${s.drift.length === 1 ? '' : 's'}${s.drift.length ? `: ${s.drift.slice(0, 3).map((d) => `${d.value} ≈ ${d.near}`).join(', ')}${s.drift.length > 3 ? ', …' : ''}` : ''}`);
      out(`  style   ${rel(res.files.json)}`);
      out(`  notes   ${rel(res.files.md)}`);
      if (res.files.png) out(`  sheet   ${rel(res.files.png)}`);
      return 0;
    }
    if (cmd === 'proof') {
      if (rest.includes('-h') || rest.includes('--help')) {
        out(HELP);
        return 0;
      }
      const opts = parseProofArgs(rest);
      const res = await proof(opts, { log: err });
      if (res.png) out(`proof   ${rel(res.png)}  (errors ${res.before.errors} -> ${res.after.errors}, warnings ${res.before.warnings} -> ${res.after.warnings})`);
      if (res.zoom) out(`zoom    ${rel(res.zoom)}`);
      if (res.video) out(`video   ${rel(res.video)}`);
      return 0;
    }
    if (cmd === 'perf') {
      if (rest.includes('-h') || rest.includes('--help')) {
        out(HELP);
        return 0;
      }
      const opts = parsePerfArgs(rest);
      err(`mantis perf ${opts.url} · routes ${opts.routes.join(',')} · ${opts.profile} · ${opts.runs} run${opts.runs === 1 ? '' : 's'}`);
      const res = await perf(opts, { log: err });
      if (opts.json) {
        out(JSON.stringify(res.report, null, 2));
      } else {
        out('');
        for (const r of res.report.routes) {
          if (!r.metrics) {
            out(`${r.route}  failed`);
            continue;
          }
          const m = r.metrics;
          out(`${r.route}  LCP ${fmtMs(m.lcp?.median)} · FCP ${fmtMs(m.fcp?.median)} · TBT ${fmtMs(m.tbt?.median)} · CLS ${m.cls?.median ?? '–'} · ${fmtKb(m.bytes?.median)} in ${m.requests?.median ?? '–'} requests${r.devServer ? '  (dev server)' : ''}`);
        }
        const s = res.report.summary;
        out(`Fixes: ${s['do-first']} do first · ${s.plan} plan · ${s.nice} nice to have · ${s['your-call']} your call`);
        for (const f of res.report.findings.slice(0, 3)) out(`  ${savingLabel(f).padEnd(14)} ${f.title}`);
        out(`  report  ${rel(path.join(res.latestDir, 'perf.md'))}`);
        out(`  run     ${rel(res.runDir)}`);
      }
      return res.exitCode;
    }
    throw new UsageError(`unknown command "${cmd}" (use look, learn, perf or proof)`);
  } catch (e) {
    if (e instanceof UsageError) {
      err(`mantis: ${e.message}`);
      err(`Run "mantis --help" for usage.`);
      return 2;
    }
    if (e instanceof UnreachableError || e instanceof BrowserError) {
      err(`mantis: ${e.message}`);
      return 2;
    }
    err(`mantis crashed: ${e && e.stack ? e.stack : e}`);
    return 2;
  }
}
