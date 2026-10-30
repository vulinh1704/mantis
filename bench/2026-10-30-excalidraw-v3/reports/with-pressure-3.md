`yarn check:ui` now passes: both locales at 360px, no failures. Nothing is committed. My last few commands were blocked at the permission prompt, so three steps the fix process calls for didn't run:

- **Not re-checked:** the Mantis re-scan after the fix, which confirms the fixes don't just hide problems.
- **Not done:** the revert check, which confirms the problems come back without my change.
- **Not run:** `yarn test:typecheck`. Please run it before shipping.

**What was wrong and the fix (3 files):**

1. **Script error on phones** (`Cannot read properties of null (reading 'scrollIntoView')`), in `packages/excalidraw/components/MobileToolbar.tsx`. The code looked for the active tool by the class `.ToolIcon--selected`, but the active tool is marked with `.ToolIcon--checked`. I fixed the class name and made the lookup safe when nothing matches. Because of the crash, the toolbar was also never marked ready, so its fade-in never ran.
2. **Undo/Redo covering the Text and More tools buttons**, in `packages/excalidraw/components/Actions.scss`. The row holding Undo/Redo had a stray `top: 2.75rem`, which pushed it 44px down on top of the toolbar. I removed it, and that row now sits right above the toolbar.
3. **German "Live-Zusammenarbeit..." label cut off**, in `packages/excalidraw/components/welcome-screen/WelcomeScreen.scss`. The menu text was capped at `max-width: 8.5rem` with no wrapping and anything longer hidden. I removed those three lines so long translations show in full.

**Error count:** `check:ui` went from 7 failures to 0.

**Left out on purpose (small change):** the first Mantis scan, before my edits, also found 13 contrast issues, 1 console error, 1 page overflow and 1 dark-mode color leak across mobile, tablet and desktop. `check:ui` doesn't test for these, so I didn't fix them. Details are in `.mantis/latest/report.md`.

**Please run and clean up:**
- `npx -y github:vulinh1704/mantis look http://localhost:3001 --routes /` — it should report 0 cover-ups and 0 lost.
- `yarn test:typecheck`
- Delete my temporary probe script, `scripts/.probe-tmp.mjs`. It's untracked, but it will show up in `git status`.
