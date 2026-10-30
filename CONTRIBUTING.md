# Contributing to Mantis

The most useful contributions are reports from real apps:
- a **false positive** (Mantis flagged something that works);
- a **missed bug** (a broken screen Mantis said nothing about);
- a **cover-up Mantis missed** (a change that hid a bug and still got "0 cover-ups").

Each has an issue form. A public URL or a minimal HTML page that reproduces it is worth more than a long description.

## Setup

Node.js 20 or newer.

```bash
npm ci
npx playwright install chromium
npm test
```

`npm test` runs every suite in `test/`, including end-to-end runs against the fixtures. It takes about a minute.

## Where things live

| Path | What it is |
|---|---|
| `src/detectors/` | One file per issue type. Each runs in the page (or on the screenshot) and returns issues with a selector, a message and evidence. |
| `src/inpage/lib.js` | Helpers injected into the page: computed styles, clipping, layers, colors. |
| `src/look.js`, `src/compare.js` | The `look` command, and the comparison with the previous run that finds cover-ups. |
| `fixtures/buggy-app/` | A small site with planted bugs. `PLANTED.json` lists exactly what Mantis must report, and on which screens. |
| `fixtures/clean-app/` | The same site with every bug fixed honestly. Mantis must report nothing here. |
| `skills/` | The agent skills (`SKILL.md`). |
| `bench/` | The agent benchmarks and their harness. |

## Changing a detector

1. Plant the bug in `fixtures/buggy-app` and add it to `PLANTED.json`. Fix it the honest way in `fixtures/clean-app`.
2. Make `npm test` pass. The fixture test fails on any missing finding, and on any extra one.
3. Run `mantis look` on a few real sites before and after your change, and check every new finding by hand. Put the numbers in the PR ("on 6 sites, 4 new findings, 3 real, 1 false positive in a demo frame"). The README's Numbers section is built the same way.
4. When a finding can't be measured well, leave it out and say so in the README's Limits. A quiet detector is better than a noisy one.

## Pull requests

- One change per PR, with tests.
- AI-assisted changes are welcome. Say so in the PR, and say what you ran and looked at yourself.
- Benchmarks and Numbers are published with their misses. Please keep it that way: no claim without a run behind it.
