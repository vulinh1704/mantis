/**
 * The Mantis GitHub Action's main step: run `mantis look` or `mantis perf` on the URL (after the
 * baseline URL, when there is one, so the run compares with it), then write the job summary, the
 * pull request comment and the step outputs. Failing is left to the action's last step, so the
 * reports are uploaded and the comment is posted either way.
 *
 * Inputs come as INPUT_* environment variables (see action.yml). No dependencies: Node built-ins
 * and the `mantis` installed by the previous step.
 */
import { spawn } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const input = (name) => (process.env[`INPUT_${name.toUpperCase().replace(/-/g, '_')}`] ?? '').trim();
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean).join(',');

/** CLI arguments for one run, from the action's inputs. */
export function mantisArgs(command, url, inputs, out, baseline) {
  const args = [command, url, '--out', out, '--baseline', baseline];
  const flag = (f, v) => {
    if (v) args.push(f, v);
  };
  flag('--routes', list(inputs.routes ?? ''));
  if (command === 'look') {
    flag('--viewports', list(inputs.viewports ?? ''));
    flag('--schemes', list(inputs.schemes ?? ''));
    flag('--locales', list(inputs.locales ?? ''));
    flag('--locale-strategy', inputs.localeStrategy);
    flag('--dark-strategy', inputs.darkStrategy);
  } else {
    flag('--runs', inputs.runs);
    flag('--profile', inputs.profile);
  }
  // extra options, split on spaces outside quotes
  for (const m of (inputs.args ?? '').matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) args.push(m[1] ?? m[2] ?? m[3]);
  return args;
}

function mantis(args) {
  return new Promise((resolve) => {
    console.log(`$ mantis ${args.join(' ')}`);
    const child = spawn('mantis', args, { stdio: 'inherit' });
    child.on('error', (err) => {
      console.log(`::error::could not start mantis: ${err.message}`);
      resolve(2);
    });
    child.on('close', (code) => resolve(code ?? 2));
  });
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
/** Cut at a word boundary, with an ellipsis, and never inside an open `code` span. */
export function short(s, max) {
  if (s.length <= max) return s;
  let cut = s.slice(0, max).replace(/\s+\S*$/, '');
  if ((cut.match(/`/g) ?? []).length % 2) cut = cut.slice(0, cut.lastIndexOf('`')).trimEnd();
  return `${cut} …`;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Markdown for a look report: the counts, the comparison, and the issues as a table. */
export function lookSummary(report, { url, baselineUrl }) {
  const s = report.summary;
  const b = report.baseline;
  const icon = s.errors ? '🔴' : s.warnings ? '🟡' : '🟢';
  const lines = [`### ${icon} Mantis look: ${plural(s.errors, 'error')}, ${plural(s.warnings, 'warning')} in ${plural(s.cells, 'cell')}`, ''];
  lines.push(`\`${url}\`${baselineUrl ? ` compared with \`${baselineUrl}\`` : ''}`, '');
  if (b) {
    lines.push(`**${b.fixed.length} fixed · ${b.new.length} new · ${plural(b.coverUps, 'cover-up')} · ${b.lost} lost**${b.coverUps ? ': an issue went away because its element was hidden, removed or shrunk, not fixed.' : ''}`, '');
  }
  const issues = (report.issues ?? []).slice().sort((x, y) => (x.severity === y.severity ? 0 : x.severity === 'error' ? -1 : 1));
  if (issues.length) {
    lines.push('| | type | where | screens | |', '|---|---|---|---|---|');
    for (const i of issues.slice(0, 20)) {
      const cells = i.cells.length > 3 ? `${i.cells.slice(0, 3).join(', ')} +${i.cells.length - 3}` : i.cells.join(', ');
      lines.push(`| ${i.severity === 'error' ? '🔴' : '🟡'} | ${esc(i.type)} | \`${esc(i.selector ?? i.route)}\` | ${esc(cells)} | ${short(esc(i.message), 160)} |`);
    }
    if (issues.length > 20) lines.push('', `… and ${issues.length - 20} more in report.md.`);
    lines.push('');
  }
  return lines.join('\n');
}

const fmtMs = (ms) => (ms == null ? '–' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
const RATE = { good: '🟢', 'needs-improvement': '🟡', poor: '🔴' };

/** Markdown for a perf report: the metrics per route, the receipt, cover-ups and the first fixes. */
export function perfSummary(report, { url, baselineUrl }) {
  const s = report.summary;
  const todo = s['do-first'] + s.plan;
  const b = report.baseline;
  const icon = b?.coverUps.length ? '🔴' : todo ? '🟡' : '🟢';
  const lines = [`### ${icon} Mantis perf: ${s['do-first']} to do first, ${s.plan} to plan, ${s.nice} nice to have, ${s['your-call']} your call`, ''];
  lines.push(`\`${url}\`${baselineUrl ? ` compared with \`${baselineUrl}\`` : ''} · ${report.profile.label} · median of ${plural(report.runs, 'run')}`, '');
  if (b) lines.push(`**${b.receipt}**`, '');
  for (const c of b?.coverUps ?? []) lines.push(`> 🔴 **Faster, or just emptier?** \`${c.route}\`: ${c.improved.join(', ')}, but ${c.reasons.join('; ')}.`, '');
  const routes = report.routes.filter((r) => r.metrics);
  if (routes.length) {
    lines.push('| route | LCP | FCP | TBT | CLS | transferred |', '|---|---|---|---|---|---|');
    for (const r of routes) {
      const m = r.metrics;
      const cell = (k, f) => (m[k] ? `${RATE[m[k].rating] ?? ''} ${f(m[k].median)}` : '–');
      lines.push(`| \`${esc(r.route)}\` | ${cell('lcp', fmtMs)} | ${cell('fcp', fmtMs)} | ${cell('tbt', fmtMs)} | ${cell('cls', String)} | ${m.bytes ? `${Math.round(m.bytes.median / 1024)} KB` : '–'} |`);
    }
    lines.push('');
  }
  const top = report.findings.filter((f) => f.bucket === 'do-first' || f.bucket === 'plan').slice(0, 8);
  if (top.length) {
    lines.push('**Fix first**', '');
    for (const f of top) lines.push(`- ${f.bucket === 'do-first' ? '✅ do first' : '🛠 plan'} · ${esc(f.title)} (${f.metric === 'bytes' ? `−${f.savings.kb} KB` : f.metric === 'cls' ? `CLS −${f.savings.cls}` : `${f.metric === 'data' ? 'data' : f.metric.toUpperCase()} −${fmtMs(f.savings.ms)}`}, risk ${f.fixRisk})`);
    lines.push('');
  }
  return lines.join('\n');
}

async function setOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${String(v).replace(/\n/g, ' ')}\n`).join(''));
}

async function main() {
  const url = input('url');
  const command = input('command') || 'look';
  const baselineUrl = input('baseline-url');
  const failOn = input('fail-on') || 'exit';
  const out = path.resolve(input('out') || '.mantis');
  if (!url) throw new Error('the url input is required');
  if (command !== 'look' && command !== 'perf') throw new Error(`command must be look or perf (got "${command}")`);
  if (!['exit', 'cover-ups', 'never'].includes(failOn)) throw new Error(`fail-on must be exit, cover-ups or never (got "${failOn}")`);
  const inputs = {
    routes: input('routes'), viewports: input('viewports'), schemes: input('schemes'), locales: input('locales'),
    localeStrategy: input('locale-strategy'), darkStrategy: input('dark-strategy'), runs: input('runs'), profile: input('profile'), args: input('args'),
  };
  await mkdir(out, { recursive: true });
  await setOutputs({ 'out-dir': out });

  let baseline = 'none';
  if (baselineUrl) {
    const baseOut = path.join(out, 'baseline');
    const code = await mantis(mantisArgs(command, baselineUrl, inputs, baseOut, 'none'));
    const dir = command === 'perf' ? path.join(baseOut, 'perf', 'latest') : path.join(baseOut, 'latest');
    if (code === 2) console.log(`::warning title=Mantis::the baseline ${baselineUrl} could not be checked; the run is not compared`);
    else baseline = dir;
  }
  const code = await mantis(mantisArgs(command, url, inputs, out, baseline));
  const latest = command === 'perf' ? path.join(out, 'perf', 'latest') : path.join(out, 'latest');
  const report = await readJson(path.join(latest, command === 'perf' ? 'perf.json' : 'report.json'));

  let markdown;
  let counts;
  if (!report) {
    markdown = `### 🔴 Mantis ${command}: \`${url}\` could not be checked\n\nSee the job log.\n`;
    counts = { errors: 0, warnings: 0, coverUps: 0 };
  } else if (command === 'perf') {
    markdown = perfSummary(report, { url, baselineUrl });
    counts = { errors: report.summary['do-first'] + report.summary.plan, warnings: report.summary.nice, coverUps: report.baseline?.coverUps.length ?? 0 };
  } else {
    markdown = lookSummary(report, { url, baselineUrl });
    counts = { errors: report.summary.errors, warnings: report.summary.warnings, coverUps: report.baseline?.coverUps ?? 0 };
  }
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  const commentFile = path.join(out, `action-comment-${command}.md`);
  await writeFile(commentFile, markdown);

  const fail = failOn === 'never' ? false : failOn === 'cover-ups' ? counts.coverUps > 0 : code !== 0;
  const reason = code === 2 ? `${url} could not be checked` : counts.coverUps ? `${plural(counts.coverUps, 'cover-up')}: a fix that only hid the problem` : command === 'perf' ? `${counts.errors} perf fixes to do first or to plan` : `${plural(counts.errors, 'error')} found`;
  await setOutputs({
    errors: counts.errors, warnings: counts.warnings, 'cover-ups': counts.coverUps, 'exit-code': code,
    report: path.join(latest, command === 'perf' ? 'perf.md' : 'report.md'), 'comment-file': commentFile, fail, reason,
  });
  console.log(`\n${markdown}`);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch(async (err) => {
    console.log(`::error title=Mantis::${err.message}`);
    await setOutputs({ fail: true, reason: err.message });
    process.exitCode = 1;
  });
}
