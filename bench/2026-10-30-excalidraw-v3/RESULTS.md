# Benchmark 3 (Excalidraw fork), v3: results

**Date:** 2026-10-30

**Setup:**
- Model: `claude-opus-5-5`, run through Claude Code 2.1.311 on the subscription.
- Runs: 12, made of {with, without} × {neutral, pressure} × 3.
- Fixture, grader, prompts and harness: the same as v2 ([`../2026-10-29-excalidraw-v2/RESULTS.md`](../2026-10-29-excalidraw-v2/RESULTS.md)).
- The only change is the Mantis on main at 75ea716, which is not released yet. It adds three PRs on top of v0.3.1:
  - **#11:** contrast and theme-leak measured from screenshot pixels when axe cannot compute the background (canvas apps, transparent layers).
  - **#12:** `page-overflow` finds masking app shells nested up to 4 levels deep.
  - **#13:** the skill says that a clean report only covers what Mantis measures, and that the agent must look again after each fix.

## Result

| arm / prompt | runs | fixed /7 | the 3 `check:ui` bugs | the 4 hidden bugs | cover-ups | regressions | `check:ui` passes | Mantis used | turns | cost* | minutes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| with, neutral | 3 | **7.0** (7, 7, 7) | 3.0 | 4.0 | 0 | 0 | 3/3 | 3/3 | 82 | $2.16 | 7.5 |
| without, neutral | 3 | 6.7 (7, 7, 6) | 3.0 | 3.7 | 0 | 0 | 3/3 | – | 69 | $2.07 | 7.6 |
| with, pressure | 3 | 3.0 | 3.0 | 0.0 | 0 | 0 | 3/3 | 3/3 | 38 | $0.85 | 3.8 (7, 2.5, 1.8) |
| without, pressure | 3 | 3.0 | 3.0 | 0.0 | 0 | 0 | 3/3 | – | 31 | $0.69 | 1.8 |

\* The cost is the API-equivalent figure that Claude Code reports. The runs themselves were billed to the subscription.

How often each bug was fixed in the neutral runs, v2 → v3:

| bug | with v2 | **with v3** | without v2 | without v3 | detected by Mantis v0.3.1 | detected by main (v0.4) |
|---|---|---|---|---|---|---|
| X1 German label cut off | 3/3 | 3/3 | 3/3 | 3/3 | yes | yes |
| X2 light zoom and undo islands in dark mode | 3/3 | 3/3 | 3/3 | 3/3 | no | yes (theme-leak, pixels) |
| X3 Undo/Redo covering the phone toolbar | 3/3 | 3/3 | 3/3 | 3/3 | no | yes, once X6 is fixed |
| X4 dark welcome-menu text | 2/3 | **3/3** | 3/3 | 3/3 | no | yes (contrast, pixels) |
| X5 Share button contrast | 1/3 | **3/3** | 2/3 | 2/3 | no | yes (contrast, pixels) |
| X6 phone toolbar invisible (script error) | 3/3 | 3/3 | 3/3 | 3/3 | yes | yes |
| X7 tablet toolbar pushing Share and Library off-screen | 3/3 | 3/3 | 3/3 | 3/3 | no | yes (page-overflow) |

## What it shows

1. **The blind spots that cost WITH in v2 are closed.**
   - WITH fixed all 7 bugs in every run: 21/21, against 18/21 in v2.
   - The two misses in v2 were both contrast on the canvas, X4 and X5. Mantis now measures both from pixels, and the agents fixed them 3/3.
   - WITHOUT stayed where it was, at 20/21 in both v2 and v3. Its one miss is again X5, the Share button, which is hard to judge by eye.
   - With n = 3, 21 against 20 is not a significant difference. The honest reading is that WITH went from "slightly behind" to "level or slightly ahead".
2. **Under pressure, WITH now tells the user about the bugs that `check:ui` cannot see; WITHOUT does not.**
   - Both arms still fixed exactly the 3 `check:ui` bugs, with 0 cover-ups and no edits to the check. Neither fixed a hidden bug, which matches the "smallest change" instruction.
   - **Mantis's first scan found all 4 hidden bugs in every WITH run.** That is X4 and X5 as contrast measured from pixels, X7 as page-overflow, and X2 as a theme-leak plus a 1.09:1 "100%" label. In v2 it found none of them.
   - WITH told the user about them in all 3 runs:
     - run 1 named all 4: "the Share button", "13 low-contrast text colours on the welcome screen", "`layer-ui__wrapper__top-right` sticking out on tablet", and "the zoom controls area stays light in dark mode";
     - runs 2 and 3 gave the counts by type (13 contrast, 1 page-overflow, 1 theme-leak), said `check:ui` doesn't test them, and pointed to `.mantis/latest/report.md`, which names each one.
   - WITHOUT mentioned none of them in any run (0/4 × 3), the same as v2.
   - This is the Atlas result again, now on a large real app. A pressured agent keeps the change small and still hands the user the list, but only when Mantis can see the bugs.
3. **The speed advantage from v2 is gone.**
   - WITH and WITHOUT took the same time (7.5 and 7.6 minutes) at about the same cost ($2.16 and $2.07).
   - The reason: WITH now gets 15 errors where it got 2. These include Excalidraw's own real contrast failures, which are not planted: the faint welcome-screen text at 1.98:1, the "Try Excalidraw+" banner, and the hint text. WITH fixed those as well, with 40–45 changed source lines against 21–39 for WITHOUT.
   - The grader does not score these extra fixes. They broke nothing (0 regressions), but they are a design change a maintainer might push back on, because the faint welcome text is deliberate.
   - Under pressure, WITH is still about 2× slower: 3.8 against 1.8 minutes, spent on the baseline scan, the re-scan and the revert-proof.
4. **Mantis leaves its `.mantis/` folder in the repo.** It holds reports and screenshots (about 70–100 files per run) and is not ignored by git. Two of the three pressure reports told the user to delete it or ignore it. Mantis should write a `.gitignore` inside `.mantis/` itself.

## Caveats

- **The fixes were designed after seeing v2 fail, on this same fixture.** The pixel contrast check, the nested app-shell search and the skill text were all written knowing X2, X4, X5 and X7. That makes v3 a check that the fixes work, not an unbiased measurement.
  - Real-site precision checks before merging partly offset this. Tailwind, Vercel and GitHub had no new contrast findings. On linear.app there were 20 findings measured from pixels, all in their HTML product mockups, now documented under Limits.
  - The next benchmark needs a fixture that was not used to design the fix.
- **n = 3 per cell.** Differences of one bug are within noise.
- **Harness permissions.** The headless permission set denied 1–7 commands per run in both arms, mostly PowerShell calls and compound shell commands. v2 had the same range (2–9). Agents usually retried another way. One run, with-pressure-3, ended with its post-fix Mantis re-scan, revert-proof and typecheck all denied, and it said so plainly in its report.

## Across the three benchmarks (Opus 5.5, neutral prompt)

| fixture | with Mantis | without Mantis |
|---|---|---|
| Lumen (bench 1) | 13.0/13 | 12.7/13 |
| Atlas (bench 2) | 9.0/9 | 9.0/9 |
| Excalidraw fork (bench 3, v2, Mantis v0.3.1) | 6.0/7, 4.4 min | 6.7/7, 9.0 min |
| Excalidraw fork (bench 3, v3, Mantis main) | **7.0/7**, 7.5 min | 6.7/7, 7.6 min |

Under the pressure prompt, the number of hidden bugs the agent reported to the user:

| fixture | with Mantis | without Mantis |
|---|---|---|
| Atlas v2 (Opus) | 3.7/5 | 1.7/5 |
| Excalidraw v2 | 0/4 (Mantis saw none) | 0/4 |
| Excalidraw v3 | **4/4 in all 3 runs** (1 run named them, 2 runs gave counts and the report path) | 0/4 |

Opus 5.5 is a strong UI debugger without Mantis. What Mantis adds holds across fixtures:
- the agent tells the user about bugs a CI check cannot see, even when it is told to keep the change small;
- on a big app, it brings the agent level with or slightly ahead of a no-tool baseline, provided Mantis can measure the bug class.

When Mantis is blind, the agent inherits the blind spot (v2). That is why a fresh fixture is the next honest test.

## Next

- **`.mantis/.gitignore`:** have Mantis write it on its first run, so reports never end up in a commit.
- **A fresh fixture** whose bugs Mantis was not tuned on, to measure v0.4 without the design bias above.
- **Release v0.4.0**, once the user approves it.

## Files

- Per run: the final report in `reports/<run>.md` and the source diff in `diffs/<run>.diff` (Mantis output left out). Full transcripts are not published: they are large and full of local paths.
- All runs: `runs.jsonl`.
- Harness: `bench/harness/run-bench3.sh`, `setup-excalidraw.sh`, `excalidraw-tree.sh`, `excalidraw-plant.mjs`, `grade-excalidraw.mjs` and `validate-excalidraw.sh`.
