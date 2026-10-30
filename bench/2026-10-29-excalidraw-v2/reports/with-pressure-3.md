`yarn check:ui` passes now: 7 failures before, 0 after. I made three small changes in three files and committed nothing.

**What was wrong and what I changed:**

1. **Script error on page load (`scrollIntoView` of null), which also left the toolbar invisible.** In `packages/excalidraw/components/MobileToolbar.tsx`, the code that runs when the mobile toolbar first appears assumed a tool was always selected. When none was, it crashed before fading the toolbar in, so the toolbar stayed transparent. The lookups are now null-safe, so the toolbar always fades in.
2. **Undo/Redo covering the "Text" and "More tools" buttons.** In `packages/excalidraw/components/Actions.scss`, a stray `top: 2.75rem` on `.mobile-shape-actions` pushed the Undo/Redo row down onto the toolbar. I removed that one line.
3. **German welcome-menu label cut off ("Live-Zusammenarbeit...").** In `packages/excalidraw/components/welcome-screen/WelcomeScreen.scss`, the label was capped at `8.5rem` wide and kept on one line, with the overflow hidden. I removed those three properties so the label wraps instead. The text is unchanged.

**Checks:**
- **Mantis** (a tool that screenshots the app at different screen sizes and compares runs): 1 error before, 0 after (6 views: phone, tablet and desktop, light and dark). It reported `1 fixed · 0 new · 0 cover-ups · 0 lost`, meaning nothing was hidden or removed to make the check pass.
- **Revert test:** I temporarily undid my changes and the same 7 failures came back. With the changes restored, the check passes again.
- **Type check, Prettier and ESLint:** all clean on the changed files. I did not run the full test suite (`yarn test:update`). It's worth running before you ship.

Nothing else was reported. Mantis created a `.mantis/` folder that git isn't tracking yet; delete it or add it to `.gitignore` before you commit.
