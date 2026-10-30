import { ISSUE_TYPES } from './detectors/index.js';
import { storageStateName } from './options.js';
import { sha1 } from './util.js';

/**
 * @typedef {object} RawIssue
 * @property {string} type
 * @property {'error'|'warn'} severity
 * @property {string|null} selector
 * @property {{x:number,y:number,width:number,height:number}|null} rect
 * @property {string} message
 * @property {object} [evidence]
 * @property {string} [key]  Extra dedupe discriminator (same type + route + selector + key = same issue).
 * @property {string} [dedupeKey]  Replaces selector + key for dedupe (same type + route + dedupeKey = same issue).
 */

/**
 * @typedef {object} Issue
 * @property {number} id
 * @property {string} fingerprint  Stable across runs: the same issue in a later run has the same fingerprint.
 * @property {string} type
 * @property {'error'|'warn'} severity
 * @property {string} route
 * @property {string[]} cells  "viewport/scheme/locale"
 * @property {string|null} selector
 * @property {object|null} rect
 * @property {string} message
 * @property {object} evidence
 * @property {string|null} screenshot
 * @property {{cell: string, severity: string, rect: object|null, message?: string, evidence?: object}[]} occurrences
 */

/** Collects raw issues from all cells and merges the same issue across cells. */
export class IssueRegistry {
  constructor() {
    /** @type {Issue[]} */
    this.issues = [];
    this.byKey = new Map();
  }

  static keyOf(route, raw) {
    // `dedupeKey` lets a detector merge occurrences whose selector differs per cell (e.g. one
    // CLS issue per route); otherwise type + route + selector + key identify an issue.
    if (raw.dedupeKey) return [raw.type, route, '#', raw.dedupeKey].join('\u0000');
    return [raw.type, route, raw.selector ?? '', raw.key ?? ''].join('\u0000');
  }

  /** Short hash of keyOf(), stored in report.json so a later run can find the same issue. */
  static fingerprint(route, raw) {
    return sha1(IssueRegistry.keyOf(route, raw)).slice(0, 12);
  }

  /**
   * @param {string} route
   * @param {string} cell  "viewport/scheme/locale"
   * @param {RawIssue} raw
   * @param {string|null} shot  screenshot path relative to the run dir
   * @returns {Issue}
   */
  add(route, cell, raw, shot = null) {
    const key = IssueRegistry.keyOf(route, raw);
    let issue = this.byKey.get(key);
    if (!issue) {
      issue = {
        id: this.issues.length + 1,
        fingerprint: IssueRegistry.fingerprint(route, raw),
        type: raw.type,
        severity: raw.severity,
        route,
        cells: [],
        selector: raw.selector ?? null,
        rect: raw.rect ?? null,
        message: raw.message,
        evidence: raw.evidence ?? {},
        screenshot: null,
        occurrences: [],
      };
      this.byKey.set(key, issue);
      this.issues.push(issue);
    }
    if (raw.severity === 'error') issue.severity = 'error';
    const existing = issue.occurrences.find((o) => o.cell === cell);
    if (!existing) {
      issue.cells.push(cell);
      issue.occurrences.push({
        cell,
        severity: raw.severity,
        rect: raw.rect ?? null,
        ...(raw.message !== issue.message ? { message: raw.message } : {}),
        evidence: raw.evidence ?? {},
      });
    } else if (raw.severity === 'error') {
      existing.severity = 'error';
    }
    if (!issue.screenshot && shot && raw.rect) issue.screenshot = shot;
    return issue;
  }
}

/** Unique values of `list` in the order given by `order`. */
function ordered(list, order) {
  const set = new Set(list);
  return order.filter((x) => set.has(x));
}

/**
 * Compress a set of cells into a readable pattern, e.g. `mobile/*\/vi` or `all cells`.
 * Falls back to a comma list when the set is not a full product of its axes.
 * @param {string[]} cells  "viewport/scheme/locale"
 * @param {{viewports: string[], schemes: string[], locales: string[]}} matrix
 */
export function compressCells(cells, matrix) {
  if (!cells.length) return '';
  const set = new Set(cells);
  const parts = [...set].map((c) => c.split('/'));
  const vs = ordered(parts.map((p) => p[0]), matrix.viewports);
  const ss = ordered(parts.map((p) => p[1]), matrix.schemes);
  const ls = ordered(parts.map((p) => p[2]), matrix.locales);
  const isProduct = vs.length * ss.length * ls.length === set.size &&
    vs.every((v) => ss.every((s) => ls.every((l) => set.has(`${v}/${s}/${l}`))));
  if (isProduct) {
    const fmt = (list, all) => (list.length === all.length && all.length > 1 ? '*' : list.join(','));
    const fv = fmt(vs, matrix.viewports);
    const fs = fmt(ss, matrix.schemes);
    const fl = fmt(ls, matrix.locales);
    if (vs.length === matrix.viewports.length && ss.length === matrix.schemes.length && ls.length === matrix.locales.length) return 'all cells';
    return `${fv}/${fs}/${fl}`;
  }
  // Not a product: group by locale, then try to compress each locale's cells.
  const out = [];
  for (const l of ls) {
    const sub = [...set].filter((c) => c.endsWith(`/${l}`));
    const subParts = sub.map((c) => c.split('/'));
    const sv = ordered(subParts.map((p) => p[0]), matrix.viewports);
    const sschemes = ordered(subParts.map((p) => p[1]), matrix.schemes);
    if (sv.length * sschemes.length === sub.length) {
      const fs = sschemes.length === matrix.schemes.length && matrix.schemes.length > 1 ? '*' : sschemes.join(',');
      out.push(`${sv.join(',')}/${fs}/${l}`);
    } else {
      const sorted = sub.sort((a, b) => {
        const [av, as] = a.split('/');
        const [bv, bs] = b.split('/');
        return matrix.viewports.indexOf(av) - matrix.viewports.indexOf(bv) || matrix.schemes.indexOf(as) - matrix.schemes.indexOf(bs);
      });
      out.push(...sorted);
    }
  }
  return out.join(' + ');
}

/** Expand a pattern like `mobile,tablet/*\/vi` against the matrix (used by tests and PLANTED.json). */
export function expandCells(pattern, matrix) {
  if (pattern === 'all cells' || pattern === '*') pattern = '*/*/*';
  const out = [];
  for (const part of pattern.split(/\s*\+\s*/)) {
    const [v, s, l] = part.split('/');
    if (l === undefined) throw new Error(`bad cell pattern "${part}"`);
    const pick = (tok, all) => (tok === '*' ? all : tok.split(','));
    for (const vv of pick(v, matrix.viewports)) {
      for (const sv of pick(s, matrix.schemes)) {
        for (const lv of pick(l, matrix.locales)) out.push(`${vv}/${sv}/${lv}`);
      }
    }
  }
  return [...new Set(out)];
}

const typeRank = (t) => {
  const i = ISSUE_TYPES.indexOf(t);
  return i < 0 ? ISSUE_TYPES.length : i;
};

/**
 * Assemble the report object written to report.json.
 * @param {object} p
 * @param {string} p.version
 * @param {string} p.runId
 * @param {Date} p.startedAt
 * @param {Date} p.finishedAt
 * @param {object} p.options   parsed LookOptions
 * @param {object[]} p.cells
 * @param {Issue[]} p.issues
 * @param {string[]} p.notes
 * @param {object|null} [p.baseline]  comparison with an earlier run (compare.js summarize)
 * @param {object|null} [p.project]  name, logo, brand color and repo for the sheets (project.js)
 */
export function buildReport({ version, runId, startedAt, finishedAt, options, cells, issues, notes, baseline = null, project = null, style = null }) {
  const routeOrder = options.routes;
  const cellByKey = new Map(cells.map((c) => [`${c.route}|${c.key}`, c]));
  for (const c of cells) {
    c.errors = 0;
    c.warnings = 0;
    c.issueIds = [];
  }
  for (const issue of issues) {
    for (const o of issue.occurrences) {
      const c = cellByKey.get(`${issue.route}|${o.cell}`);
      if (!c) continue;
      c.issueIds.push(issue.id);
      if (o.severity === 'error') c.errors++;
      else c.warnings++;
    }
  }
  const byType = {};
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    byType[issue.type] ??= { errors: 0, warnings: 0 };
    if (issue.severity === 'error') {
      errors++;
      byType[issue.type].errors++;
    } else {
      warnings++;
      byType[issue.type].warnings++;
    }
  }
  const sortedIssues = issues.slice().sort((a, b) => a.id - b.id);
  const crashed = cells.filter((c) => c.crashed).length;
  return {
    tool: 'mantis',
    version,
    runId,
    startedAt: startedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    url: options.url,
    project,
    style,
    matrix: {
      routes: routeOrder,
      viewports: options.viewports.map((v) => ({ name: v.name, width: v.width, height: v.height })),
      schemes: options.schemes,
      locales: options.locales,
      darkStrategy: options.darkStrategyText,
      localeStrategy: options.localeStrategyText ?? 'browser',
      ignore: options.ignore ?? [],
      storageState: storageStateName(options.storageState),
    },
    summary: {
      errors,
      warnings,
      cells: cells.length,
      failedCells: cells.filter((c) => c.status === 'failed').length,
      crashedCells: crashed,
      byType,
      // 2 = Mantis could not analyse some cells (results incomplete), 1 = error issues found.
      exitCode: crashed > 0 ? 2 : errors > 0 ? 1 : 0,
    },
    baseline,
    cells,
    issues: sortedIssues,
    notes,
  };
}

function cellLabel(report, c) {
  if (c.status === 'failed') return 'fail';
  if (c.status === 'not-localized') return 'n/l';
  if (!c.errors && !c.warnings) return 'ok';
  return [c.errors ? `${c.errors}E` : '', c.warnings ? `${c.warnings}W` : ''].filter(Boolean).join(' ');
}

const pad2 = (n) => String(n).padStart(2, '0');
export function formatLocalTime(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * The agent-facing report: summary table, then issues grouped by type (deduped across cells).
 * @param {ReturnType<typeof buildReport>} report
 * @param {{maxPerType?: number}} [opts]
 */
export function renderMarkdown(report, { maxPerType = 30 } = {}) {
  const m = report.matrix;
  const matrix = { viewports: m.viewports.map((v) => v.name), schemes: m.schemes, locales: m.locales };
  const lines = [];
  const s = report.summary;
  lines.push('# Mantis report', '');
  const dims = `${m.routes.length} route${m.routes.length > 1 ? 's' : ''} × ${m.viewports.length} viewport${m.viewports.length > 1 ? 's' : ''} × ${m.schemes.length} scheme${m.schemes.length > 1 ? 's' : ''} × ${m.locales.length} locale${m.locales.length > 1 ? 's' : ''}`;
  lines.push(`\`${report.url}\` · ${formatLocalTime(report.startedAt)} · ${s.cells} cells (${dims})${m.storageState ? ` · session \`${m.storageState}\`` : ''}${m.localeStrategy && m.localeStrategy !== 'browser' ? ` · locale via \`${m.localeStrategy}\`` : ''} · ${(report.durationMs / 1000).toFixed(1)}s`, '');
  lines.push(`**${s.errors} error${s.errors === 1 ? '' : 's'} · ${s.warnings} warning${s.warnings === 1 ? '' : 's'}** (exit ${s.exitCode})${s.failedCells ? ` · ${s.failedCells} cell(s) failed to load` : ''}`, '');

  // Summary table: rows = route · locale, columns = viewport × scheme.
  const cols = [];
  for (const v of matrix.viewports) for (const sc of matrix.schemes) cols.push([v, sc]);
  lines.push(`| route · locale | ${cols.map(([v, sc]) => `${v} ${sc}`).join(' | ')} |`);
  lines.push(`|---|${cols.map(() => '---').join('|')}|`);
  for (const route of m.routes) {
    for (const loc of matrix.locales) {
      const row = cols.map(([v, sc]) => {
        const c = report.cells.find((x) => x.route === route && x.viewport === v && x.scheme === sc && x.locale === loc);
        return c ? cellLabel(report, c) : '-';
      });
      lines.push(`| \`${route}\` · ${loc} | ${row.join(' | ')} |`);
    }
  }
  lines.push('');
  lines.push('E = errors, W = warnings, n/l = not localized (same text as the first locale). Each issue is numbered on the screenshots in `shots/`; cells read `viewport/scheme/locale` (`*` = all).', '');

  if (report.style) {
    lines.push(`Checked against the house style in \`${report.style.file}\` (learned ${formatLocalTime(report.style.learnedAt)} from \`${report.style.url}\`).`, '');
  }

  const b = report.baseline;
  if (b) {
    lines.push(`## Compared with run ${b.runId}`, '');
    lines.push(`**${b.fixed.length} fixed · ${b.new.length} new · ${b.coverUps} cover-up${b.coverUps === 1 ? '' : 's'} · ${b.lost} lost** in ${b.cellsCompared} cells compared`, '');
    if (b.coverUps) lines.push('A cover-up means an issue disappeared because its element was hidden, removed, shrunk or cut off, not fixed. Undo those changes and fix the cause.', '');
    for (const f of b.fixed.slice(0, maxPerType)) {
      const routeText = m.routes.length > 1 ? ` · route \`${f.route}\`` : '';
      lines.push(`- fixed: was #${f.id} ${f.type}${f.selector ? ` \`${f.selector}\`` : ''} · ${compressCells(f.cells, matrix)}${routeText}`);
    }
    if (b.fixed.length > maxPerType) lines.push(`- … ${b.fixed.length - maxPerType} more in report.json`);
    if (b.new.length) lines.push(`- new: ${b.new.map((id) => `#${id}`).join(', ')}`);
    if (b.fixed.length || b.new.length) lines.push('');
  }

  if (!report.issues.length) {
    lines.push('No issues found.', '');
  } else {
    lines.push('## Issues', '');
    const types = [...new Set(report.issues.map((i) => i.type))].sort((a, b) => {
      const ea = report.summary.byType[a].errors;
      const eb = report.summary.byType[b].errors;
      if ((ea > 0) !== (eb > 0)) return ea > 0 ? -1 : 1;
      return typeRank(a) - typeRank(b);
    });
    for (const type of types) {
      const list = report.issues
        .filter((i) => i.type === type)
        .sort((a, b) => (a.severity === b.severity ? a.id - b.id : a.severity === 'error' ? -1 : 1));
      const bt = report.summary.byType[type];
      const counts = [bt.errors ? `${bt.errors} error${bt.errors > 1 ? 's' : ''}` : '', bt.warnings ? `${bt.warnings} warning${bt.warnings > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ');
      lines.push(`### ${type} (${counts})`, '');
      for (const issue of list.slice(0, maxPerType)) {
        const where = issue.selector ? ` \`${issue.selector}\`` : '';
        const routeText = m.routes.length > 1 ? ` · route \`${issue.route}\`` : '';
        lines.push(`- **#${issue.id}** ${issue.severity}${where} · ${compressCells(issue.cells, matrix)}${routeText}`);
        lines.push(`  ${issue.message}${issue.screenshot ? ` — \`${issue.screenshot}\`` : ''}`);
      }
      if (list.length > maxPerType) lines.push(`- … ${list.length - maxPerType} more in report.json`);
      lines.push('');
    }
  }
  if (report.notes.length) {
    lines.push('## Notes', '');
    for (const n of report.notes) lines.push(`- ${n}`);
    lines.push('');
  }
  return lines.join('\n');
}
