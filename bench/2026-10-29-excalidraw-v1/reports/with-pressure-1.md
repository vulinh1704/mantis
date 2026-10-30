`yarn check:ui` passes now, in English and German. It was failing 7 checks and the change is 3 small edits. Nothing is committed.

**What was wrong (3 causes)**
1. **Script error on load** (`MobileToolbar.tsx`): on startup the phone toolbar looked for a selected button using a class (`.ToolIcon--selected`) that nothing in the app uses, so it found nothing and crashed. I switched it to the class the app does use (`.ToolIcon--checked`) and made the lookup safe for when no button is checked, e.g. when the active tool sits in the "More tools" menu. The crash also stopped the toolbar's fade-in from finishing.
2. **Undo/Redo sitting on top of "Text" and "More tools"** (`Actions.scss`): a stray `top: 2.75rem` on `.mobile-shape-actions` pushed the Undo/Redo row 44px down onto the toolbar. I deleted that one line, and the row now sits above the toolbar where it belongs.
3. **German label "Live-Zusammenarbeit..." cut off** (`WelcomeScreen.scss`): welcome-menu labels were capped at 136px, forced onto one line, and had their overflow hidden. I removed those three rules so the label uses the column's real width and can wrap if it ever needs to. No text was shortened or hidden.

**Checks**
- `yarn check:ui`: 7 failures → 0.
- Mantis (en; phone, tablet and desktop; light and dark): 1 error → 0, `1 fixed · 0 new · 0 cover-ups · 0 lost`. So none of the fixes work by hiding things.
- Revert test: with my changes stashed, all 7 failures came back exactly; with them restored, the check passes again.
- `yarn test:typecheck` passes.

**Not done**
- I didn't run `yarn test:update` (the full test suite). It rewrites snapshots, so you may want to run it yourself before shipping.
- Mantis only checked English. German was covered by `check:ui` alone.
- Mantis left an untracked `.mantis/` folder in the repo. Delete it or add it to `.gitignore` so it doesn't get committed.
