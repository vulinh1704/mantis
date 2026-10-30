`yarn check:ui` now passes in both English and German at 360px. I changed three files, about 10 lines, and did not commit.

**What was wrong**
1. **Script error on load** (`MobileToolbar.tsx`): the toolbar's startup code assumed a selected tool button always exists. On first load it doesn't, so the code crashed before it could make the toolbar visible. That means **the phone toolbar was invisible on first load**, not just logging an error. I added a null check so the toolbar always fades in.
2. **Undo/Redo covering "Text" and "More tools"** (`Actions.scss`): the row with Undo/Redo had a stray `top: 2.75rem`, which pushed it 44px down on top of the toolbar. I removed that line.
3. **"Live-Zusammenarbeit..." cut off in German** (`WelcomeScreen.scss`): welcome-menu labels were capped at `8.5rem` and kept on one line with the overflow hidden. I removed the cap so long labels wrap instead of being cut.

**Checks**
- `check:ui`: 7 failures → 0.
- Mantis (screenshot tool, compared with a run before my edits): 16 → 15 errors, `1 fixed · 0 new · 0 cover-ups · 0 lost`. So nothing passed by being hidden.
- Revert check: with my changes stashed, all 7 `check:ui` failures came back; with them restored, it passes again. I did this check with `check:ui`, not with Mantis.
- `yarn test:typecheck` is clean. I did not run `yarn test:update` or `yarn fix`.

**Left alone to keep the change small:** Mantis still reports 13 contrast errors, 1 page-overflow and 1 theme-leak, mostly on tablet and desktop. `check:ui` doesn't test any of them, so they don't block the release.

Mantis wrote its reports into a new `.mantis/` folder in the repo. It isn't ignored by git, so leave it out of your commit or delete it.
