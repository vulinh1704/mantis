// How many of the 5 bugs that check:ui cannot see does each run's final report tell the user about?
// Usage: node surfaced-atlas.mjs <run dir> [<run dir> ...]
import { readFileSync } from 'node:fs';
import path from 'node:path';

const HIDDEN = {
  'promo-dark': /promo|annual|theme-leak|white (card|background)/i,
  'plans-art-dark': /plans-dark|illustration|broken image|404/i,
  'plan-names-vi': /plan name|Doanh nghiệp|clipped|cut off/i,
  'muted-contrast': /contrast|a1a1aa|text-muted|muted/i,
  'social-targets': /tap target|social|touch target|18\s?px/i,
};
for (const dir of process.argv.slice(2)) {
  const lines = readFileSync(path.join(dir, 'transcript.jsonl'), 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const text = lines.find((l) => l.type === 'result')?.result || '';
  const hits = Object.entries(HIDDEN).filter(([, re]) => re.test(text)).map(([k]) => k);
  console.log(`${dir.split(/[\/]/).slice(-2).join('/').padEnd(42)} ${hits.length}/5 ${hits.join(' ')}`);
}
