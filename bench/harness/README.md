# Benchmark harness

These are the scripts that produced the results one folder up. They were written for one machine, so expect to adapt them:
- Windows 11 runs Claude Code headless from Git Bash.
- WSL (Ubuntu 24.04) runs the Lumen and Atlas graders, with this repo checked out at `~/projects/mantis`.
- Paths were made relative to this repo when the scripts were published.

| benchmark | run | set up a sandbox | grade | summarize |
|---|---|---|---|---|
| 1 Lumen | `run-bench.sh` | `setup-lumen.sh` | `grade-lumen.mjs` | `summarize-run.mjs` |
| 2 Atlas | `run-bench2.sh` | `setup-atlas.sh`, `atlas-variant.mjs` | `grade-atlas.mjs` | `summarize-atlas.mjs`, `surfaced-atlas.mjs` |
| 3 Excalidraw | `run-bench3.sh` | `setup-excalidraw.sh`, `excalidraw-tree.sh`, `excalidraw-plant.mjs`, `excalidraw-serve.sh` | `grade-excalidraw.mjs` | `summarize-atlas.mjs` |

Before any agent run, `validate-atlas.sh` and `validate-excalidraw.sh` check the grader on the buggy, clean and cover-up variants.

## Running

- **Auth.** Every published run used the Claude Code subscription that is logged in (`claude -p`). With `BENCH_AUTH=api`, `run-bench.sh` reads an API key from `~/.mantis-bench/anthropic.env` instead. Never paste a key into a chat or put it in a file in the repo.
- **Options.**
  - `BENCH_MODEL` picks the model; the default is `claude-opus-5-5`.
  - `BENCH_ONLY="with-neutral-1 …"` runs only those ids (benchmarks 2 and 3).
  - Results go to a new dated folder in `bench/` unless a folder is passed.
- **Excalidraw.**
  - It needs a shared install of the fork at `$TMPDIR/mantis-bench/excalidraw-base`: Excalidraw at e7b5346, after `yarn install`.
  - `excalidraw-tree.sh` copies it into each sandbox with a real `node_modules`. Claude Code cannot list paths outside its working directory, and a symlinked `node_modules` hid Playwright from the WITHOUT arm in v1.
- **Do not change Mantis's main branch during a run.** The WITH sandboxes install the skills and run the CLI from main. Clear the npx cache for `@vulinh1704/mantis` before a new run.
