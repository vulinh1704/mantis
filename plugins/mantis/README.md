# Mantis plugin

Catches the UI bugs your coding agent can't see, and the ones it hides. Before an agent calls a frontend change done, Mantis opens the running app in a real browser. It checks every screen size, light and dark mode, and each language, and reports what is actually broken: page overflow, cut-off text, overlapping controls, unreadable contrast, dark-mode leaks, tiny tap targets, console errors, broken images and layout shift. It compares each run with the previous one, so a "fix" that only hides a bug is flagged as a cover-up.

## Install

```
/plugin install mantis --marketplace vulinh1704/mantis
```

On Claude Code older than 2.1.275, run `/plugin marketplace add vulinh1704/mantis` and then `/plugin install mantis@mantis`.

## Skills

| Skill | What it does |
|---|---|
| `mantis` | Looks at the running app and reads the report and screenshots before a UI task is called done. |
| `mantis-fix` | Fixes what Mantis found at the root, then proves the fix: the issues are gone, nothing was hidden, and they come back when the change is reverted. |
| `mantis-proof` | Makes before/after images and an optional video of a fix. |

## What it runs and touches

- **Commands.** The skills tell the agent to run the Mantis CLI, either as `mantis` or as `npx -y github:vulinh1704/mantis#v0.4.0`. npx downloads the CLI from this GitHub repository and its dependencies from npm (Playwright and axe-core). Playwright may also download Chromium.
- **Pages.** The CLI opens only the URLs the agent passes to it, usually the app's local dev server, in headless Chromium.
- **Writes.** It writes reports and screenshots to `.mantis/` in the project, with a `.gitignore` that keeps them out of git.
- **Sends.** Nothing. There is no telemetry and no account.

The plugin itself has no hooks and no MCP servers, and it runs nothing on install.

Full documentation, numbers and benchmarks: [github.com/vulinh1704/mantis](https://github.com/vulinh1704/mantis). MIT license.
