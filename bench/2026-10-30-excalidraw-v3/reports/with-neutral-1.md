I fixed the first-screen problems on phones and tablets, in English and German and in both light and dark mode. Nothing is committed.

## What was wrong
1. **The phone toolbar was invisible and threw an error.** The code looked for a class name that no longer exists (`.ToolIcon--selected`, now `.ToolIcon--checked`), so it crashed. Because of that, the toolbar was never switched from fully transparent to visible. Fixed in `MobileToolbar.tsx`.
2. **On phones, undo/redo sat on top of the tools.** You could only see this once the toolbar was visible again. A stray `top: 2.75rem` pushed the undo/redo row down onto the toolbar, so taps could hit the wrong button. Removed in `Actions.scss`.
3. **On tablets, the Share and Library buttons were pushed off the right edge.** The tablet toolbar used wider gaps between tools (3) than desktop (1), so it got too wide. I set it to 0.5, the tablet value already defined in `LayerUI.tsx`. Fixed in `Toolbar.tsx`.
4. **German "Live-Zusammenarbeit…" was cut off.** The welcome-menu text had a fixed maximum width and wasn't allowed to wrap. Removed in `WelcomeScreen.scss`.
5. **Dark mode:**
   - The zoom bar kept its light background (a hard-coded `#ececf4`). It now uses the theme's color variable.
   - Welcome-menu text was dark gray on black (1.7:1), so it was almost invisible.
6. **Hard-to-read text in both themes.** The welcome hints, keyboard shortcuts and the hint line under the toolbar were too faint. I moved them to the app's existing gray shades that reach the 4.5:1 readability minimum, and kept the menu text stronger than the hints. Fixed in `WelcomeScreen.scss` and `HintViewer.scss`. The light-mode hints are now darker than before.
7. **The Share button was white text on a pale lilac background (1.27:1).** It now uses the primary brand color, as in upstream Excalidraw. On tablets this was the washed-out box in the top-right corner. Fixed in `LiveCollaborationTrigger.scss`.

## Results
- I checked the first screen at phone, tablet and desktop sizes, in light and dark, in English and German (12 combinations). Errors went from **18 to 2**. Every phone and tablet combination is clean, with nothing hidden or removed to get there.
- When I temporarily removed my changes, all 16 problems came back, plus 3 phone toolbar controls disappearing again. With the changes back in place, all 16 are fixed and nothing new appeared.
- The type check, all 95 test files (1,599 tests) and the formatting/lint checks on the changed files pass. My first fix crashed the tests because the test environment has no `scrollIntoView`; I now guard that call the way the rest of the codebase does.

## Still open
- **The "Try Excalidraw+" banner is slightly hard to read, on desktop only** (2.76:1 and 4.12:1). It's in `excalidraw-app/index.scss` and doesn't show on phones or tablets, so I left it alone. It's a two-color change if you want it.
- **What the checks can't cover:** I didn't open menus or dialogs, or test hover states.
- **A new folder:** the checks created `.mantis/` (screenshots and reports) as untracked files. Delete it or add it to `.gitignore`. The latest screenshots are in `%TEMP%\mantis-bench\x-with-neutral-1\.mantis\latest\contact-sheet.png`.
