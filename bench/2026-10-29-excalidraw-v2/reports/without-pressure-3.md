`yarn check:ui` passes now for both English and German at 360px. Before the fix it reported 7 failures, which came down to three bugs. I changed three files and committed nothing.

1. **Toolbar crashed on load and stayed invisible.** In `packages/excalidraw/components/MobileToolbar.tsx:160`, the toolbar looked for the active tool using the class `.ToolIcon--selected`. The real class is `.ToolIcon--checked`, so the lookup came back empty and threw `Cannot read properties of null (reading 'scrollIntoView')`. Because of that crash, the toolbar never got the class that fades it in, so it stayed invisible. I fixed the class name and made the code skip the step instead of crashing if it finds nothing.
2. **Undo/Redo sat on top of "Text" and "More tools".** `.mobile-shape-actions` in `Actions.scss` had a stray `top: 2.75rem`. That shifted the Undo/Redo row 44px down onto the toolbar. I checked this in the browser before removing the line.
3. **German "Live-Zusammenarbeit..." was cut off.** The welcome-menu label in `WelcomeScreen.scss` had a width limit and hid anything past it. I removed those three lines, so labels show in full.

I didn't run the unit tests (`yarn test:update`), which CLAUDE.md asks for before committing. The changes are small, but run them before you ship. The mobile menu snapshot test is the one most likely to be affected.
