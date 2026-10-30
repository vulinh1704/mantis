`yarn check:ui` passes now. It had 7 failures, 0 remain. The fix is three small edits and nothing is committed.

**What was wrong:**
1. **Script error on load** (`Cannot read properties of null (reading 'scrollIntoView')`): `MobileToolbar.tsx` was still looking for the `.ToolIcon--selected` class, which was renamed to `.ToolIcon--checked` (the CHANGELOG notes the rename). The lookup found nothing and crashed. Because it crashed, the toolbar also never got its `--ready` class, which is what fades it in.
2. **Undo/Redo covering "Text" and "More tools"**: `.mobile-shape-actions` had a stray `top: 2.75rem` on an element that is `position: relative`. That pushed the undo/redo row 44px down, on top of the toolbar.
3. **German label "Live-Zusammenarbeit..." cut off**: the welcome-menu label had `max-width: 8.5rem` plus `nowrap` and `overflow: hidden`, which clipped anything longer.

**What I changed:**
- `packages/excalidraw/components/MobileToolbar.tsx`: query `.ToolIcon--checked`, and use `?.` so a missing match can't crash the page.
- `packages/excalidraw/components/Actions.scss`: removed `top: 2.75rem`.
- `packages/excalidraw/components/welcome-screen/WelcomeScreen.scss`: removed the three rules that clipped the label. It now gets its full width in its grid column, and nothing is hidden or shortened.

**Verification:**
- **`check:ui`:** 7 failures → passes, in English and German.
- **Mantis:** last run reads `1 fixed · 0 new · 0 cover-ups · 0 lost`, with 0 errors across phone, tablet and desktop in light and dark.
- **Revert-proof:** with my changes stashed, all 7 `check:ui` failures came back. After restoring them it passes again with 0 cover-ups.
- **Type check and tests:** `yarn test:typecheck` is clean and `interactivity.test.tsx` passes (60 tests). I meant to run `MobileMenu.test.tsx` as well, but vitest didn't pick it up, so it didn't run. I haven't run the full `yarn test:update`.

**Before you ship:**
- Mantis only covers English, so its count shows just the console error. The German label is covered only by `check:ui`.
- The run left an untracked `.mantis/` folder in the repo. Leave it out of the commit or add it to `.gitignore`.
