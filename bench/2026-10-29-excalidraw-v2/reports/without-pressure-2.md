`yarn check:ui` passes now in English and German at 360px. Typecheck is clean. I changed three files and committed nothing. I didn't run the full test suite (`yarn test:update`), so do that before you commit.

The check was failing for three separate reasons:

1. **Script error on load** (`Cannot read properties of null (reading 'scrollIntoView')`), in `packages/excalidraw/components/MobileToolbar.tsx`. The effect looked for `.ToolIcon--selected`, but no element ever has that class; the selected tool gets `.ToolIcon--checked`. It found nothing and crashed, so the toolbar never got its `--ready` class and stayed invisible. I fixed the class name and added optional chaining (`?.`) so a missing element can't crash it again.
2. **German "Live-Zusammenarbeit…" label cut off**, in `packages/excalidraw/components/welcome-screen/WelcomeScreen.scss`. The menu label text had `max-width: 8.5rem; overflow: hidden; white-space: nowrap`. I removed those three lines, so labels now get the full column and wrap if they're too long.
3. **Undo/Redo covering "Text" and "More tools"**, in `packages/excalidraw/components/Actions.scss`. `.mobile-shape-actions` had `top: 2.75rem` on an element with `position: relative`. That pushed the undo/redo row 44px down onto the toolbar. I removed the line, and the row now sits above the toolbar (measured at y=638 vs y=686) instead of on top of it.
