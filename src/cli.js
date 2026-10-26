import path from 'node:path';
import { BrowserError, UnreachableError, look } from './look.js';
import { UsageError, parseLookArgs, parseProofArgs } from './options.js';
import { proof } from './proof.js';
import { VERSION } from './util.js';

export const HELP = `mantis ${VERSION} — gives your coding agent eyes for UI work

Usage
  mantis look <url> [options]
  mantis proof --before <runDir> --after <runDir> [--out <file.png>]
               [--video --before-url <url> --after-url <url> [--viewport mobile]
                [--dark-strategy media|class:dark|attr:data-theme=dark]]

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
                               identical to the first one is marked "not localized"
  --dark-strategy media|class:dark|attr:data-theme=dark
                               how dark mode is switched on (default media)
  --out .mantis                output directory
  --wait <ms>                  extra wait after network idle and web fonts
  --json                       print report.json to stdout
  --concurrency <n>            route/viewport groups run in parallel (default 3)
  --timeout <ms>               navigation timeout (default 30000)
  --ignore <selector>          skip matching elements and their subtree in every
                               detector (repeatable); pages can also mark elements
                               with the data-mantis-ignore attribute

proof: side-by-side before/after sheet of two runs (run dirs, or the aliases
latest / prev / first under .mantis), written to --out (default .mantis/proof.png).
--video records a short visit of both URLs (load, scroll, switch to dark) and
stacks them into one MP4 next to --out (default .mantis/proof.mp4) with ffmpeg;
without ffmpeg the two raw .webm recordings are kept instead.

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
        out(`  report  ${rel(path.join(res.latestDir, 'report.md'))}`);
        out(`  sheet   ${rel(path.join(res.latestDir, 'contact-sheet.png'))}`);
        out(`  run     ${rel(res.runDir)}`);
      }
      return res.exitCode;
    }
    if (cmd === 'proof') {
      if (rest.includes('-h') || rest.includes('--help')) {
        out(HELP);
        return 0;
      }
      const opts = parseProofArgs(rest);
      const res = await proof(opts, { log: err });
      if (res.png) out(`proof   ${rel(res.png)}  (errors ${res.before.errors} -> ${res.after.errors}, warnings ${res.before.warnings} -> ${res.after.warnings})`);
      if (res.video) out(`video   ${rel(res.video)}`);
      return 0;
    }
    throw new UsageError(`unknown command "${cmd}" (use look or proof)`);
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
