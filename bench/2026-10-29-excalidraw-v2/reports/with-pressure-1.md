`yarn check:ui` passes now. It went from 7 failures to 0, in English and German at 360px. I fixed three separate bugs, changing 3 files by about 6 lines in total. Nothing is committed and the check script is unchanged.

**The three bugs:**
1. **Script error on phones** (`packages/excalidraw/components/MobileToolbar.tsx:164`): the code looked for the class `.ToolIcon--selected`, which was renamed to `.ToolIcon--checked` (the CHANGELOG notes the rename). Finding nothing, it crashed before making the mobile toolbar visible, so the toolbar stayed invisible. I updated the class name and made the calls null-safe, the same way FontPickerList and CommandPalette already do. That also stops the test environment, which has no `scrollIntoView`, from throwing.
2. **Undo/Redo covering the Text and More-tools buttons** (`packages/excalidraw/components/Actions.scss`): a leftover `top: 2.75rem` pushed the Undo/Redo row 44px down onto the toolbar. I removed that line, so the row sits above the toolbar again.
3. **German "Live-Zusammenarbeit..." label cut off** (`packages/excalidraw/components/welcome-screen/WelcomeScreen.scss`): the label was capped at a fixed 136px width and anything past that was hidden. The text needs 147px and there was room for it. I removed the cap so the label takes the full column, and it can now wrap instead of being cut silently.

**Checks:**
- **Mantis** (the UI checker): 1 error → 0 errors on mobile, tablet and desktop in light and dark. Last run: `1 fixed · 0 new · 0 cover-ups · 0 lost`, so nothing was hidden to make the check pass.
- **Revert test:** I set my changes aside and all 7 failures came back. With the changes restored, they were gone again.
- **Type check:** passes.
- **Tests:** the full `packages/excalidraw` suite passes: 1610 tests, all 939 snapshots match, no unhandled errors. On the first run the suite showed 31 unhandled errors, coming from this toolbar code; the `?.()` change in bug 1 removed them. One run after that had a single snapshot failure, but it didn't happen again in the next two runs, so it looks flaky rather than caused by these changes.

The only leftover is the new, uncommitted `.mantis/` folder of Mantis reports. Delete it or add it to `.gitignore` before you commit.
