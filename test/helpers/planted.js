/**
 * Scores a Mantis report against a fixture's PLANTED.json (see fixtures/buggy-app/PLANTED.json).
 * Pure functions, so the scoring itself is unit-tested too.
 */
import { expandCells } from '../../src/report.js';

/** Does `issue` satisfy expectation `exp` of planted bug `bug`? */
export function matches(issue, bug, exp) {
  if (issue.type !== exp.type || issue.route !== bug.route || issue.severity !== exp.severity) return false;
  if (exp.selector) {
    const sel = exp.selector;
    const exact = issue.selector === sel;
    const inside = Boolean(exp.descendants && issue.selector && issue.selector.startsWith(sel + ' '));
    if (!exact && !inside) return false;
  }
  if (exp.with && (issue.evidence?.with ?? null) !== exp.with) return false;
  if (exp.message && !new RegExp(exp.message).test(issue.message)) return false;
  return true;
}

/**
 * @returns {{
 *   expectations: {id: string, type: string, ok: boolean, issues: number[], missingCells: string[], extraCells: string[], reason: string|null}[],
 *   unexpected: object[],
 *   byType: Record<string, {expected: number, detected: number, issues: number, matched: number}>,
 * }}
 */
export function evaluate(report, planted) {
  const matrix = planted.matrix;
  const matchedIssues = new Set();
  const expectations = [];
  for (const bug of planted.bugs) {
    bug.expect.forEach((exp, i) => {
      const hits = report.issues.filter((issue) => matches(issue, bug, exp));
      for (const h of hits) matchedIssues.add(h.id);
      const want = new Set(expandCells(exp.cells, matrix));
      const got = new Set(hits.flatMap((h) => h.cells));
      const missingCells = [...want].filter((c) => !got.has(c));
      const extraCells = hits.flatMap((h) => h.cells.filter((c) => !want.has(c)).map((c) => `#${h.id} ${c}`));
      const minIssues = exp.minIssues ?? 1;
      // Grouped issues (one root cause in many elements) carry evidence.count.
      const elements = hits.reduce((sum, h) => sum + (h.evidence?.count ?? 1), 0);
      let reason = null;
      if (hits.length < minIssues) reason = `expected at least ${minIssues} issue(s), found ${hits.length}`;
      else if (exp.minCount && elements < exp.minCount) reason = `expected at least ${exp.minCount} affected element(s), found ${elements}`;
      else if (missingCells.length) reason = `missing in ${missingCells.length} cell(s): ${missingCells.join(', ')}`;
      else if (extraCells.length) reason = `also reported in unexpected cells: ${extraCells.join(', ')}`;
      expectations.push({
        id: `${bug.id}${bug.expect.length > 1 ? `[${i}]` : ''}`,
        type: exp.type,
        ok: reason === null,
        issues: hits.map((h) => h.id),
        missingCells,
        extraCells,
        reason,
      });
    });
  }
  const unexpected = report.issues.filter((i) => !matchedIssues.has(i.id));
  const byType = {};
  for (const e of expectations) {
    byType[e.type] ??= { expected: 0, detected: 0, issues: 0, matched: 0 };
    byType[e.type].expected++;
    if (e.ok) byType[e.type].detected++;
  }
  for (const issue of report.issues) {
    byType[issue.type] ??= { expected: 0, detected: 0, issues: 0, matched: 0 };
    byType[issue.type].issues++;
    if (matchedIssues.has(issue.id)) byType[issue.type].matched++;
  }
  return { expectations, unexpected, byType };
}

/** Plain-text recall/precision table for test diagnostics. */
export function formatScore(score) {
  const rows = Object.entries(score.byType).sort(([a], [b]) => a.localeCompare(b));
  const lines = ['detector        recall          precision'];
  for (const [type, s] of rows) {
    const recall = s.expected ? `${s.detected}/${s.expected}` : '-';
    const precision = s.issues ? `${s.matched}/${s.issues}` : '-';
    lines.push(`${type.padEnd(16)}${recall.padEnd(16)}${precision}`);
  }
  return lines.join('\n');
}
