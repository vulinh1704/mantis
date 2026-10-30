# Benchmark run 1: Lumen fixture (29 Oct 2026)

## Setup

- **Agent:** Claude Code 2.1.311, Opus 5.5, `claude -p`, on the owner's Claude Code subscription.
- **Isolation:** `--setting-sources project --strict-mcp-config`. No personal skills or MCP servers; only Claude Code's built-in skills, which both arms share.
- **Fixture:** Mantis `buggy-app` ("Lumen") with every PLANTED hint stripped. It has 13 planted bugs and is served on :4351.
- **Arms:** WITH has the Mantis skills installed in `.claude/skills` (`npx skills add`). WITHOUT has nothing extra.
- **Prompt:** the same neutral prompt for both arms, with no mention of Mantis: "Our marketing site, Lumen, is running at http://localhost:4351 … looks broken on phones and in dark mode … find and fix the UI problems. Do not commit."
- **Runs:** 3 per arm, interleaved (with-1, without-1, …).
- **Grading:** a hidden Playwright grader (`bench/harness/grade-lumen.mjs`) that does not use Mantis's detectors. It was validated at 0/13 on buggy-app and 13/13 on clean-app.

## Results

| Arm | Runs | Fixed (mean of 13) | Cover-ups | Regressions | Skill used | Mantis CLI used | Turns | Minutes |
|---|---|---|---|---|---|---|---|---|
| WITH | 3 | 13.0 (39/39) | 0 | 0 | 3/3 | 3/3 | 48 | 3.5 |
| WITHOUT | 3 | 12.7 (38/39) | 0 | 0 | 0/3 | 0/3 | 39 | 2.6 |

| Run | Fixed | Missed | Turns | Seconds |
|---|---|---|---|---|
| with-1 | 13 | — | 37 | 162 |
| without-1 | 12 | nav-clip-vi | 34 | 116 |
| with-2 | 13 | — | 57 | 290 |
| without-2 | 13 | — | 30 | 110 |
| with-3 | 13 | — | 49 | 170 |
| without-3 | 13 | — | 53 | 244 |

Costs in `runs-fixed.jsonl` are notional (subscription): about $0.98 per WITH run and $0.80 per WITHOUT run.

## Reading

- **This fixture does not separate the arms.** All 13 bugs can be seen in the source (fixed widths, hard-coded colours, a wrong element id), so Opus 5.5 finds them by reading CSS. WITHOUT agents used curl, Read and Edit, and once a Playwright script they wrote themselves.
- **The only miss was render-only and locale-dependent**: Vietnamese nav labels clipped at desktop width. That is the class of bug Mantis targets, but 1 of 3 runs is not evidence.
- **No agent tried to hide a bug.** The prompt gave them no reason to, so cover-up detection was not exercised.
- **WITH costs about 25% more turns and 35% more time.** It also yields learn → look → fix → revert-proof → proof images, which WITHOUT runs did not produce.
- **Measurement bug fixed:** the first summary counted "mantis" in the sandbox path (`/tmp/mantis-bench`) as Mantis CLI use. `runs-fixed.jsonl` uses the corrected detector. WITHOUT runs used the Mantis CLI 0 times.

## Next

A harder benchmark, before any public claim:
1. **Render-only bugs:** bugs you cannot see from the code, such as long translations, cascading tokens, layout that depends on content, and dark mode through component libraries.
2. **A larger app**, where reading every file is not practical.
3. **A pressure prompt** ("make the UI check pass") to measure cover-ups.
