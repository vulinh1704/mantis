// Summarise one benchmark run as a JSON line, or print the table of all runs.
// Usage: node summarize-run.mjs <id> <arm> <claude exit> <seconds> <run dir>
//        node summarize-run.mjs --table <runs.jsonl>
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

if (process.argv[2] === '--table') {
  const runs = readFileSync(process.argv[3], 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const arms = {};
  for (const r of runs) (arms[r.arm] ||= []).push(r);
  const avg = (xs, f) => (xs.length ? xs.reduce((s, x) => s + (f(x) ?? 0), 0) / xs.length : 0);
  console.log('arm      runs  fixed/13  cover-ups  regressions  skill used  mantis CLI  turns  cost   minutes');
  for (const [arm, xs] of Object.entries(arms)) {
    console.log(`${arm.padEnd(8)} ${String(xs.length).padStart(4)}  ${avg(xs, (x) => x.fixed).toFixed(1).padStart(8)}  ${avg(xs, (x) => x.coverUps).toFixed(1).padStart(9)}  ${avg(xs, (x) => x.regressions).toFixed(1).padStart(11)}  ${String(xs.filter((x) => x.skillUsed).length).padStart(10)}  ${String(xs.filter((x) => x.mantisCli).length).padStart(10)}  ${avg(xs, (x) => x.turns).toFixed(0).padStart(5)}  $${avg(xs, (x) => x.costUsd).toFixed(2).padStart(5)}  ${(avg(xs, (x) => x.seconds) / 60).toFixed(1).padStart(7)}`);
  }
  process.exit(0);
}

const [id, arm, code, seconds, dir] = process.argv.slice(2);
const lines = existsSync(path.join(dir, 'transcript.jsonl'))
  ? readFileSync(path.join(dir, 'transcript.jsonl'), 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];
const result = lines.find((l) => l.type === 'result') || {};
const init = lines.find((l) => l.type === 'system' && l.subtype === 'init') || {};
const tools = lines.filter((l) => l.type === 'assistant').flatMap((l) => (l.message?.content || []).filter((c) => c.type === 'tool_use'));
const grade = existsSync(path.join(dir, 'grade.json')) ? JSON.parse(readFileSync(path.join(dir, 'grade.json'), 'utf8')) : null;
const diffstat = existsSync(path.join(dir, 'diffstat.txt')) ? readFileSync(path.join(dir, 'diffstat.txt'), 'utf8').trim().split('\n').pop() : '';
console.log(JSON.stringify({
  id,
  arm,
  claudeExit: Number(code),
  seconds: Number(seconds),
  model: init.model ?? null,
  claudeCode: init.claude_code_version ?? null,
  turns: result.num_turns ?? null,
  costUsd: result.total_cost_usd ?? 0,
  resultSubtype: result.subtype ?? null,
  skillUsed: tools.some((t) => t.name === 'Skill'),
  // The sandbox path contains "mantis-bench", so match the CLI itself, not the word.
  mantisCli: tools.some((t) => t.name === 'Bash' && /vulinh1704\/mantis|\bmantis (look|learn|proof)\b/.test(String(t.input?.command))),
  fixed: grade?.fixed ?? null,
  coverUps: grade?.coverUps?.length ?? null,
  coverUpIds: grade?.coverUps ?? [],
  regressions: grade?.regressions?.length ?? null,
  open: grade ? Object.entries(grade.bugs).filter(([, b]) => !b.pass).map(([k]) => k) : null,
  diffstat,
}));
