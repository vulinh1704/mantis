`yarn check:ui` passes now in both English and German at 360px. Before the fix it had 7 failures. I changed three files and committed nothing.

**What was wrong and what I changed:**
1. **Script error on load** (`MobileToolbar.tsx`): the toolbar looked for the class `.ToolIcon--selected`, which no longer exists (the CHANGELOG says it was renamed to `.ToolIcon--checked`). The lookup came back empty and the code crashed. Because of the crash, the toolbar never got the class that fades it in. I switched it to `.ToolIcon--checked` and made it skip the scroll safely if nothing is selected.
2. **Undo/Redo covering "Text" and "More tools"** (`Actions.scss`): a leftover `top: 2.75rem` on `.mobile-shape-actions` pushed that row 44px down, on top of the main toolbar. I deleted that one line, so the row sits back above the toolbar.
3. **German label "Live-Zusammenarbeit..." cut off** (`WelcomeScreen.scss`): the menu label was capped at `max-width: 8.5rem` and wasn't allowed to wrap. I removed the cap and let long labels wrap. The full text still shows; nothing is hidden or shrunk.

**How I checked it:**
- Mantis (the screenshot checker this repo uses) found 1 error before the fix and 0 after, with `1 fixed · 0 new · 0 cover-ups · 0 lost`. That means the problems were fixed, not hidden.
- I also checked that it's really my change that fixes them: with the three edits taken out, all 7 failures came back, and with the edits put back, the check passed again.
- The type check, eslint on the changed TSX file and prettier on all three files are clean. I did not run the full `yarn test:update` suite.

Mantis left an untracked `.mantis/` folder in the repo. Don't commit it; delete it or add it to `.gitignore`.
