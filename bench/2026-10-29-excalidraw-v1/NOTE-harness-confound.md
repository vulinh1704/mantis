# These v1 results are confounded. Do not use them.

In this run, every sandbox's `node_modules` was a junction to a shared install outside the sandbox. Claude Code blocks listing paths outside its working directory, so:

- the WITHOUT agents' attempts to find Playwright or a browser (`ls node_modules | grep playwright`, `Get-ChildItem node_modules`) were **denied**;
- they concluded that they could not render the app and fixed only what they could read: 2/7 in every neutral run.

The WITH arm was not affected, because `npx github:vulinh1704/mantis` runs from npm's own cache.

In a real checkout, `node_modules` sits inside the repo. The harness was fixed (`excalidraw-tree.sh` now copies a real `node_modules` and points the workspace links at the sandbox's own packages), and all 12 runs were repeated in `../2026-10-29-excalidraw-v2/`.

The v1 numbers are kept for the record: WITH, neutral 5.3/7; WITHOUT, neutral 2.0/7; both pressure 3/3 with 0 cover-ups.
