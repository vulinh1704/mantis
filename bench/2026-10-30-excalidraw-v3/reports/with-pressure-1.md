`yarn check:ui` now passes in English and German at 360px. It started with 7 failures. The fix is 3 files, +7/−8 lines, and nothing is committed.

**What was wrong and what I changed:**

1. **Script error `Cannot read properties of null (reading 'scrollIntoView')`** in `packages/excalidraw/components/MobileToolbar.tsx`. The toolbar searched for `.ToolIcon--selected`, but buttons actually use `.ToolIcon--checked`. The lookup returned null and the code crashed. Because of the crash, the toolbar also never got `mobile-toolbar--ready`, so it stayed at `opacity: 0`. I fixed the class name and added null guards, since the active tool can sit inside the "More tools" dropdown where no toolbar button is checked. I also wrote the call as `?.scrollIntoView?.()`, the same way other components in the codebase do: the test environment has no `scrollIntoView`, and the fix exposed that.
2. **Undo/Redo covering "Text" and "More tools"** in `Actions.scss`. A stray `top: 2.75rem` on `.mobile-shape-actions` pushed the Undo/Redo row 44px down, on top of the toolbar. I removed that one line, and the row is back in its own slot above the toolbar.
3. **German welcome label cut off** ("Live-Zusammenarbeit...") in `WelcomeScreen.scss`. The label had `max-width: 8.5rem` with `nowrap` and `overflow: hidden`, which cut off the 147px German text even though its column had room. Now the label fills its grid column and wraps if it ever needs to. No text was shortened.

**Verification:**
- **`yarn check:ui`:** passed (0 failures, from 7).
- **Mantis comparison:** 0 cover-ups and 0 lost. "1 fixed" was the console error; the overlap and label fixes didn't show in its count, but `check:ui` confirms them.
- **Revert check:** with my changes stashed, all 7 `check:ui` failures came back. With them restored, it passes again.
- **Tests and lint:** `yarn test:typecheck` is clean. All 68 test files in `packages/excalidraw/tests` pass, with no unhandled errors. Eslint and Prettier are clean on the changed files.

**Left alone, to keep the change small.** Mantis still reports 15 errors that existed before and that `check:ui` doesn't test:
- 13 low-contrast text colours on the welcome screen, plus the "Try Excalidraw+" banner and Share button on desktop.
- One element sticking out past the right edge on tablet (`layer-ui__wrapper__top-right`).
- One element that stays light in dark mode on tablet/desktop (the zoom controls area).

These are worth fixing after the release. Mantis also created an untracked `.mantis/` folder of reports. Delete it, or add it to `.gitignore`, before committing.
