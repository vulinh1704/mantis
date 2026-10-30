/**
 * `mantis mcp`: Mantis as an MCP server over stdio, for any MCP client (Claude Desktop, Cursor,
 * VS Code, Codex, …). The tools run the same commands as the CLI (look, perf, learn, proof) with
 * the same options and defaults. Each returns its report as text and its sheet as an image, and
 * sends the lines the CLI logs as progress notifications while it runs.
 *
 * JSON-RPC 2.0, one message per line on stdin/stdout (the MCP stdio transport). Nothing else may
 * be written to stdout, so console.log goes to stderr while the server runs.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { learn } from './learn.js';
import { BrowserError, UnreachableError, look } from './look.js';
import { UsageError, parseLearnArgs, parseLookArgs, parsePerfArgs, parseProofArgs } from './options.js';
import { perf } from './perf/index.js';
import { proof } from './proof.js';
import { styleCounts } from './style.js';
import { VERSION, firstLine } from './util.js';

/** Protocol versions this server speaks, newest first. */
export const PROTOCOL_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']);
const MAX_IMAGE = 3.5 * 1024 * 1024;
const MAX_TEXT = 40000;

const strings = (description) => ({ type: 'array', items: { type: 'string' }, description });
const COMMON = {
  url: { type: 'string', description: 'The page to check, e.g. http://localhost:3000. Routes are resolved against it.' },
  routes: strings('Routes to visit, e.g. ["/", "/settings"]. Default: the path of url.'),
  storageState: { type: 'string', description: 'A Playwright storage state JSON file (cookies and localStorage) for pages behind a login. Keep it out of git.' },
  out: { type: 'string', description: 'Output directory. Default .mantis in the server\'s working directory.' },
};
const ANNOTATIONS = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };

export const TOOLS = Object.freeze([
  {
    name: 'mantis_look',
    title: 'Look at the UI',
    description: 'Open the running app in Chromium on every screen size, color scheme and language, and report what is broken: page overflow, cut-off text, overlaps, contrast, dark-mode leaks, small tap targets, console errors, failed requests, broken images, layout shift, off-style values. Compares with the previous run of the same URL: an issue that went away because its element was hidden, removed or shrunk is a cover-up. Returns the report and the contact sheet. Run it before calling a UI change done, and again after fixing.',
    inputSchema: {
      type: 'object',
      properties: {
        ...COMMON,
        viewports: strings('Screen sizes: mobile (360x740), tablet (768x1024), desktop (1440x900), or WxH. Default all three.'),
        schemes: strings('Color schemes: light, dark. Default both.'),
        locales: strings('Languages, e.g. ["en", "vi"]; "pseudo" stretches the first language\'s text about 40%, "pseudo-rtl" also lays it out right to left. Default ["en"].'),
        localeStrategy: { type: 'string', description: 'How the app picks its language: browser (default), path:/{locale}, query:<param>, cookie:<name> or storage:<key>.' },
        darkStrategy: { type: 'string', description: 'How dark mode is switched on: media (default), class:dark, or attr:data-theme=dark.' },
        ignore: strings('CSS selectors to leave out of every check.'),
        baseline: { type: 'string', description: 'Run to compare with: auto (default, the previous run of the same URL), none, or a run directory.' },
      },
      required: ['url'],
    },
    annotations: ANNOTATIONS,
  },
  {
    name: 'mantis_perf',
    title: 'Measure speed',
    description: 'Load each route several times cold in Chromium, throttled like a mid-range phone on slow 4G (or unthrottled with profile desktop), and rank what slows it down by impact and fix risk: LCP image problems, oversized images, render-blocking files, functions that hold the main thread, unused code, fonts, layout-shift causes, slow or chained or duplicate API calls, N+1, third parties by vendor. Each fix names its culprit (selector, URL, or file:line and function). Compares with the previous perf run: a route that got faster only because content went away is a cover-up. Returns perf.md and the perf sheet. Measure a production build.',
    inputSchema: {
      type: 'object',
      properties: {
        ...COMMON,
        runs: { type: 'integer', minimum: 1, maximum: 15, description: 'Cold visits per route; the median is reported. Default 3 here (5 on the CLI).' },
        profile: { type: 'string', enum: ['mobile', 'desktop'], description: 'mobile (default: 4x slower CPU, slow 4G) or desktop (no throttling).' },
        baseline: { type: 'string', description: 'Perf run to compare with: auto (default), none, or a run directory.' },
      },
      required: ['url'],
    },
    annotations: ANNOTATIONS,
  },
  {
    name: 'mantis_learn',
    title: 'Learn the house style',
    description: 'Measure the house style of the running app (colors per scheme with their CSS tokens, font sizes, fonts, radii, spacing, shadows, motion) and write .mantis/style.json, which later looks check against. Run it once on the unchanged app before changing styles. Returns style.md and the style sheet.',
    inputSchema: {
      type: 'object',
      properties: {
        ...COMMON,
        viewports: strings('Screen sizes, as for mantis_look. Default all three.'),
        schemes: strings('Color schemes: light, dark. Default both.'),
        darkStrategy: { type: 'string', description: 'How dark mode is switched on: media (default), class:dark, or attr:data-theme=dark.' },
      },
      required: ['url'],
    },
    annotations: ANNOTATIONS,
  },
  {
    name: 'mantis_proof',
    title: 'Before/after proof',
    description: 'Make a side-by-side before/after sheet of two look runs (run directories, or latest / prev / first), with a close-up of one fixed finding, for a pull request. Returns the sheet.',
    inputSchema: {
      type: 'object',
      properties: {
        before: { type: 'string', description: 'The run before the fix: a run directory, or latest / prev / first.' },
        after: { type: 'string', description: 'The run after the fix: a run directory, or latest / prev / first.' },
        out: { type: 'string', description: 'PNG to write. Default .mantis/proof.png.' },
      },
      required: ['before', 'after'],
    },
    annotations: ANNOTATIONS,
  },
]);

/** CLI arguments for a tool call: the server parses them with the CLI's own parsers. */
export function argvFor(name, a = {}) {
  const argv = [];
  const flag = (f, v) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v)) {
      if (v.length) argv.push(f, v.join(','));
    } else argv.push(f, String(v));
  };
  if (name === 'mantis_proof') {
    flag('--before', a.before);
    flag('--after', a.after);
    flag('--out', a.out);
    return argv;
  }
  if (a.url !== undefined) argv.push(String(a.url));
  flag('--routes', a.routes);
  flag('--out', a.out);
  flag('--storage-state', a.storageState);
  if (name === 'mantis_look' || name === 'mantis_learn') {
    flag('--viewports', a.viewports);
    flag('--schemes', a.schemes);
    flag('--dark-strategy', a.darkStrategy);
  }
  if (name === 'mantis_look') {
    flag('--locales', a.locales);
    flag('--locale-strategy', a.localeStrategy);
    for (const s of a.ignore ?? []) flag('--ignore', s);
  }
  if (name === 'mantis_look' || name === 'mantis_perf') flag('--baseline', a.baseline);
  if (name === 'mantis_perf') {
    flag('--runs', a.runs ?? 3);
    flag('--profile', a.profile);
  }
  return argv;
}

const rel = (p) => {
  const r = path.relative(process.cwd(), p);
  return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p;
};

const clip = (text) => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n\n… (cut at ${MAX_TEXT} characters: read the file for the rest)` : text);

async function readText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return '';
  }
}

/** The PNG as image content, or a line saying where it is when it is too large to send. */
async function imageContent(file) {
  try {
    const s = await stat(file);
    if (s.size > MAX_IMAGE) return { type: 'text', text: `The sheet is ${(s.size / 1024 / 1024).toFixed(1)} MB, too large to send: open ${rel(file)}.` };
    return { type: 'image', data: (await readFile(file)).toString('base64'), mimeType: 'image/png' };
  } catch {
    return null;
  }
}

/** Run one tool: the content blocks of its result. Throws UsageError and the CLI's own errors. */
export async function runTool(name, args, log = () => {}) {
  const argv = argvFor(name, args);
  if (name === 'mantis_look') {
    const res = await look(parseLookArgs(argv), { log });
    const s = res.report.summary;
    const b = res.report.baseline;
    const head = [
      `Mantis: ${s.errors} error${s.errors === 1 ? '' : 's'}, ${s.warnings} warning${s.warnings === 1 ? '' : 's'} in ${s.cells} cells${s.failedCells ? ` (${s.failedCells} failed)` : ''}`,
      b ? `vs ${b.runId}: ${b.fixed.length} fixed · ${b.new.length} new · ${b.coverUps} cover-up${b.coverUps === 1 ? '' : 's'} · ${b.lost} lost` : null,
      `report: ${rel(path.join(res.latestDir, 'report.md'))} · sheet: ${rel(path.join(res.latestDir, 'contact-sheet.png'))} · screenshots: ${rel(path.join(res.latestDir, 'shots'))}`,
    ].filter(Boolean).join('\n');
    return [{ type: 'text', text: `${head}\n\n${clip(await readText(path.join(res.latestDir, 'report.md')))}` }, await imageContent(path.join(res.latestDir, 'contact-sheet.png'))];
  }
  if (name === 'mantis_perf') {
    const res = await perf(parsePerfArgs(argv), { log });
    const s = res.report.summary;
    const b = res.report.baseline;
    const head = [
      `Fixes: ${s['do-first']} do first · ${s.plan} plan · ${s.nice} nice to have · ${s['your-call']} your call`,
      b ? `vs ${b.runId}: ${b.receipt}` : null,
      ...(b?.coverUps ?? []).map((c) => `COVER-UP ${c.route}: faster, or just emptier? ${c.reasons.join('; ')}`),
      `report: ${rel(path.join(res.latestDir, 'perf.md'))}${res.sheet ? ` · sheet: ${rel(res.sheet)}` : ''}`,
    ].filter(Boolean).join('\n');
    return [{ type: 'text', text: `${head}\n\n${clip(await readText(path.join(res.latestDir, 'perf.md')))}` }, res.sheet ? await imageContent(res.sheet) : null];
  }
  if (name === 'mantis_learn') {
    const res = await learn(parseLearnArgs(argv), { log });
    const head = `House style: ${styleCounts(res.style)}\nstyle: ${rel(res.files.json)} · notes: ${rel(res.files.md)}`;
    return [{ type: 'text', text: `${head}\n\n${clip(await readText(res.files.md))}` }, res.files.png ? await imageContent(res.files.png) : null];
  }
  if (name === 'mantis_proof') {
    const res = await proof(parseProofArgs(argv), { log });
    const head = res.png ? `proof: ${rel(res.png)} (errors ${res.before.errors} → ${res.after.errors}, warnings ${res.before.warnings} → ${res.after.warnings})${res.zoom ? `\nzoom: ${rel(res.zoom)}` : ''}` : 'No proof sheet was written.';
    return [{ type: 'text', text: head }, res.png ? await imageContent(res.png) : null];
  }
  throw new UsageError(`unknown tool "${name}"`);
}

/**
 * Serve MCP on the given streams until the input ends.
 * @param {{input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream, run?: typeof runTool}} [io]
 */
export async function serveMcp({ input = process.stdin, output = process.stdout, run = runTool } = {}) {
  const send = (msg) => output.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
  const cancelled = new Set();
  const pending = new Set();

  async function call(id, params) {
    const tool = TOOLS.find((t) => t.name === params?.name);
    if (!tool) return send({ id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } });
    const token = params?._meta?.progressToken;
    let n = 0;
    const log = (line) => {
      process.stderr.write(`${line}\n`);
      if (token !== undefined) send({ method: 'notifications/progress', params: { progressToken: token, progress: ++n, message: String(line).slice(0, 300) } });
    };
    let result;
    try {
      const content = (await run(tool.name, params.arguments ?? {}, log)).filter(Boolean);
      result = { content };
    } catch (err) {
      const known = err instanceof UsageError || err instanceof UnreachableError || err instanceof BrowserError;
      result = { content: [{ type: 'text', text: known ? `mantis: ${err.message}` : `mantis crashed: ${firstLine(err?.message ?? err)}` }], isError: true };
    }
    if (!cancelled.has(id)) send({ id, result });
  }

  function handle(msg) {
    const { id, method, params } = msg;
    const isRequest = id !== undefined && id !== null;
    if (method === 'initialize') {
      const asked = params?.protocolVersion;
      return send({
        id,
        result: {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'mantis', title: 'Mantis', version: VERSION },
          instructions: 'Mantis checks a running web app in a real browser. Use mantis_look before calling a UI change done (and again after fixing: it flags fixes that only hide a bug), mantis_perf for load speed (it ranks fixes and flags speed-ups that only remove content), mantis_learn once to record the house style, and mantis_proof for before/after evidence. Tools take seconds to minutes.',
        },
      });
    }
    if (method === 'ping') return isRequest && send({ id, result: {} });
    if (method === 'tools/list') return send({ id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      const p = call(id, params);
      pending.add(p);
      p.finally(() => pending.delete(p));
      return undefined;
    }
    if (method === 'notifications/cancelled') {
      if (params?.requestId !== undefined) cancelled.add(params.requestId);
      return undefined;
    }
    if (!isRequest) return undefined; // other notifications (initialized, …) need no answer
    return send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  }

  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ id: null, error: { code: -32700, message: 'Parse error' } });
      continue;
    }
    for (const m of Array.isArray(msg) ? msg : [msg]) {
      if (m && typeof m === 'object' && m.method) handle(m);
    }
  }
  await Promise.allSettled([...pending]);
}
