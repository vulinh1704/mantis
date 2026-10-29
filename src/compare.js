/**
 * Compare a run with an earlier one (the baseline) to tell honest fixes from cover-ups.
 *
 * Every run writes state.json next to report.json: per cell, probes of the elements behind its
 * issues and an inventory of visible controls and headings (src/inpage/state.js). The next run
 * probes the baseline's issue elements again in the same cell. When a visual issue is gone, its
 * element (and, for an overlap, the element it overlapped) must still be there, visible, as
 * large, as complete and with as much text as before. Otherwise the change only hid the symptom:
 * a `cover-up` error. Layout shift, console and network issues change by themselves on live
 * pages, so they are not checked. A control or heading that was visible in the baseline and is
 * gone now is `lost` (a warning); more than five in one cell are grouped into one warning, which
 * is what a page with live content (news, feeds) looks like.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { UsageError } from './options.js';
import { IssueRegistry } from './report.js';

/** Issue types produced by the comparison itself; they are never compared again. */
export const META_TYPES = new Set(['cover-up', 'lost']);

/** Issues about something the user sees, which an agent could "fix" by hiding the element. */
export const VISUAL_TYPES = new Set(['page-overflow', 'clipped-text', 'overlap', 'contrast', 'theme-leak', 'tap-target', 'broken-image']);

const LOST_GROUP = 5;

/** Key of a cell in state.json: `<route>|<viewport>/<scheme>/<locale>`. */
export const stateKey = (route, cell) => `${route}|${cell}`;

async function readRun(dir) {
  const [report, state] = await Promise.all([
    readFile(path.join(dir, 'report.json'), 'utf8').then(JSON.parse),
    readFile(path.join(dir, 'state.json'), 'utf8').then(JSON.parse),
  ]);
  return { dir, report, state };
}

/**
 * The run to compare with: null for `none`; the given run directory; or, for `auto` (default),
 * the most recent run of the same URL in `<out>/runs`. Runs without state.json (Mantis 0.1)
 * cannot be compared.
 * @param {{baseline?: string, out: string, url: string}} opts
 */
export async function findBaseline(opts) {
  const choice = opts.baseline ?? 'auto';
  if (choice === 'none') return null;
  if (choice !== 'auto') {
    const dir = path.resolve(choice);
    if (!existsSync(path.join(dir, 'report.json'))) throw new UsageError(`--baseline: no report.json in ${choice}`);
    if (!existsSync(path.join(dir, 'state.json'))) throw new UsageError(`--baseline: ${choice} has no state.json (made by Mantis 0.1); run look again to make a new baseline`);
    return readRun(dir);
  }
  const runsDir = path.resolve(opts.out, 'runs');
  if (!existsSync(runsDir)) return null;
  const names = (await readdir(runsDir)).sort().reverse();
  for (const name of names) {
    const dir = path.join(runsDir, name);
    if (!existsSync(path.join(dir, 'state.json'))) continue;
    try {
      const run = await readRun(dir);
      if (run.report.url === opts.url) return run;
    } catch {
      // unreadable run: try an older one
    }
  }
  return null;
}

/** Can this cell be compared with the baseline: same route, cell and viewport size, both analysed? */
export function comparable(base, info) {
  if (info.status !== 'ok') return false;
  const b = base.report.cells.find((c) => c.route === info.route && c.key === info.key);
  return !!b && b.status === 'ok' && b.width === info.width && b.height === info.height &&
    !!base.state.cells[stateKey(info.route, info.key)];
}

/** Selectors worth probing for an issue: its element and, for an overlap, the other element. */
export function issueSelectors(selector, evidence) {
  const out = [];
  for (const s of [selector, evidence?.with]) {
    if (typeof s === 'string' && s && s !== 'html' && s !== 'body' && !out.includes(s)) out.push(s);
  }
  return out;
}

function baselineIssuesIn(base, route, cell) {
  const out = [];
  for (const issue of base.report.issues) {
    if (issue.route !== route || META_TYPES.has(issue.type)) continue;
    const occurrence = issue.occurrences.find((o) => o.cell === cell);
    if (occurrence) out.push({ issue, occurrence });
  }
  return out;
}

/** Probe targets for a cell: the baseline's issue elements, with their old text as a fallback. */
export function baselineTargets(base, route, cell) {
  const probes = base.state.cells[stateKey(route, cell)]?.probes ?? {};
  const out = [];
  for (const { issue, occurrence } of baselineIssuesIn(base, route, cell)) {
    if (!VISUAL_TYPES.has(issue.type)) continue;
    for (const s of issueSelectors(issue.selector, occurrence.evidence ?? issue.evidence)) {
      out.push({ s, t: probes[s]?.text ?? null, g: probes[s]?.tag ?? null });
    }
  }
  return out;
}

/**
 * How an element changed between two probes, when the change hides a problem rather than fixing
 * it: 'removed', 'hidden', 'shrunk', 'cut', 'shortened', or null.
 */
export function coverUpKind(before, after) {
  if (!after || (before && !before.found)) return null;
  if (!after.found) return 'removed';
  if ((before ? before.rendered : true) && !after.rendered) return 'hidden';
  if (!after.rendered || !before) return null;
  if (before.font && after.font && ((after.font < 12 && before.font >= 12) || after.font <= before.font * 0.8)) return 'shrunk';
  if (after.scale < 0.85 && before.scale >= 0.95) return 'shrunk';
  if (before.ratio - after.ratio > 0.1) return 'cut';
  if (before.len >= 8 && after.len < before.len * 0.7) return 'shortened';
  return null;
}

const pct = (r) => `${Math.round(r * 100)}%`;

function coverUpIssue(issue, occurrence, selector, kind, before, after) {
  const what = selector === issue.selector ? `\`${selector}\`` : `\`${selector}\`, the element it overlapped,`;
  const change = {
    removed: 'is no longer on the page',
    hidden: 'is not visible any more',
    shrunk: before?.font && after.font < before.font ? `now renders at ${after.font}px instead of ${before.font}px` : `is now scaled down to ${after.scale}`,
    cut: `is now cut off (${pct(before?.ratio ?? 1)} → ${pct(after.ratio)} visible)`,
    shortened: `now shows ${after.len} characters of text instead of ${before?.len}`,
  }[kind];
  const gone = kind === 'removed' || kind === 'hidden';
  return {
    type: 'cover-up',
    severity: 'error',
    selector,
    key: `${issue.type} ${issue.selector}`,
    rect: gone ? before?.rect ?? occurrence.rect ?? null : after.rect ?? null,
    message: `The ${issue.type} issue on \`${issue.selector}\` is gone, but ${what} ${change}. That hides the problem instead of fixing it: undo it and fix the cause.${gone ? ' The outline shows where it was.' : ''}`,
    evidence: {
      kind,
      was: { id: issue.id, type: issue.type, selector: issue.selector, message: issue.message },
      before: before ?? null,
      after,
    },
  };
}

/** Inventory items visible before and not now, matched by kind + name (same selector first). */
export function lostItems(before, after) {
  const pool = new Map();
  for (const it of after) {
    if (!pool.has(it.k)) pool.set(it.k, []);
    pool.get(it.k).push(it.s);
  }
  const leftovers = [];
  for (const it of before) {
    const list = pool.get(it.k);
    const i = list ? list.indexOf(it.s) : -1;
    if (i >= 0) list.splice(i, 1);
    else leftovers.push(it);
  }
  const lost = [];
  for (const it of leftovers) {
    const list = pool.get(it.k);
    if (list && list.length) list.shift();
    else lost.push(it);
  }
  return lost;
}

/**
 * Compare one cell with the baseline.
 * @param {object} p
 * @param {string} p.route
 * @param {string} p.cell  "viewport/scheme/locale"
 * @param {object[]} p.raw  this run's raw issues in the cell
 * @param {{probes: object, inventory: object[]}} p.after  this run's state of the cell
 * @param {{report: object, state: object}} p.base
 * @returns {object[]} extra raw issues: cover-up and lost
 */
export function compareCell({ route, cell, raw, after, base }) {
  const before = base.state.cells[stateKey(route, cell)] ?? { probes: {}, inventory: [] };
  const now = new Set(raw.map((r) => IssueRegistry.fingerprint(route, r)));
  const out = [];
  const covered = new Set();
  for (const { issue, occurrence } of baselineIssuesIn(base, route, cell)) {
    if (!VISUAL_TYPES.has(issue.type) || now.has(issue.fingerprint)) continue;
    for (const s of issueSelectors(issue.selector, occurrence.evidence ?? issue.evidence)) {
      const kind = coverUpKind(before.probes[s], after.probes[s]);
      if (!kind) continue;
      out.push(coverUpIssue(issue, occurrence, s, kind, before.probes[s], after.probes[s]));
      covered.add(s);
      break;
    }
  }
  const lost = lostItems(before.inventory ?? [], after.inventory ?? []).filter((it) => !covered.has(it.s));
  const rectOf = (it) => ({ x: it.r[0], y: it.r[1], width: it.r[2], height: it.r[3] });
  if (lost.length > LOST_GROUP) {
    const examples = lost.slice(0, 3).map((it) => `\`${it.k}\``).join(', ');
    out.push({
      type: 'lost',
      severity: 'warn',
      selector: null,
      dedupeKey: 'lost-group',
      rect: rectOf(lost[0]),
      extraRects: lost.slice(1, 50).map(rectOf),
      message: `${lost.length} controls and headings that were visible in the baseline run are gone (${examples}, …). The page content changed (fine for live data such as news or feeds), or the change hid them. The outlines show where they were.`,
      evidence: { count: lost.length, controls: lost.slice(0, 20).map((it) => it.k) },
    });
  } else {
    for (const it of lost) {
      out.push({
        type: 'lost',
        severity: 'warn',
        selector: it.s,
        key: it.k,
        rect: rectOf(it),
        message: `\`${it.k}\` was visible in the baseline run and is not visible now. Fine if it was removed on purpose; otherwise the change hid or broke it. The outline shows where it was.`,
        evidence: { control: it.k },
      });
    }
  }
  return out;
}

/**
 * Run-level summary: which baseline issues are fixed (gone from every compared cell, and not by a
 * cover-up), which issues are new (present in a compared cell where the baseline did not have
 * them), and how many cover-ups and lost controls were found.
 * @param {{report: object}} base
 * @param {IssueRegistry} registry  this run's issues
 * @param {Set<string>} compared  stateKey()s of the compared cells
 */
export function summarize(base, registry, compared) {
  const current = new Map(registry.issues.map((i) => [i.fingerprint, i]));
  const hidden = new Set(registry.issues.filter((i) => i.type === 'cover-up').flatMap((i) => i.occurrences.map((o) => o.evidence?.was?.id)));
  const fixed = [];
  for (const issue of base.report.issues) {
    if (META_TYPES.has(issue.type) || hidden.has(issue.id)) continue;
    const cells = issue.cells.filter((c) => compared.has(stateKey(issue.route, c)));
    if (!cells.length) continue;
    const now = current.get(issue.fingerprint);
    if (!now || !cells.some((c) => now.cells.includes(c))) {
      fixed.push({ id: issue.id, type: issue.type, severity: issue.severity, route: issue.route, selector: issue.selector, cells });
    }
  }
  const prev = new Map(base.report.issues.map((i) => [i.fingerprint, i]));
  const fresh = [];
  for (const issue of registry.issues) {
    if (META_TYPES.has(issue.type)) continue;
    const old = prev.get(issue.fingerprint);
    if (issue.cells.some((c) => compared.has(stateKey(issue.route, c)) && !(old && old.cells.includes(c)))) fresh.push(issue.id);
  }
  return {
    runId: base.report.runId,
    cellsCompared: compared.size,
    fixed,
    new: fresh,
    coverUps: registry.issues.filter((i) => i.type === 'cover-up').length,
    lost: registry.issues.filter((i) => i.type === 'lost').length,
  };
}
