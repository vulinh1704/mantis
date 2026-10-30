I fixed six UI problems on the first screen. Mantis now reports no errors across mobile, tablet and desktop, in light and dark mode, in English and German (it found 4 errors along the way, all fixed). Typecheck passes and the full test suite passes. Nothing is committed.

**Phones**
1. **Toolbar invisible.** The bottom toolbar starts hidden and only fades in after scrolling to the selected tool. On the first screen no tool is selected inside the toolbar, so that step crashed and the toolbar never appeared. It now skips the scroll when there's nothing to scroll to (`MobileToolbar.tsx`).
2. **Undo/redo on top of the tools.** Once the toolbar showed up, the undo/redo row was sitting on the Text tool and the "more tools" button. A stray `top: 2.75rem` offset was pushing that row down by exactly its own height; I removed it (`Actions.scss`).

**German**
3. **"Live-Zusammenarbeit…" cut off.** Welcome menu labels were limited to a fixed width with no wrapping. I removed that limit so labels use the space the layout already gives them (`WelcomeScreen.scss`).

**Tablets**
4. **Top-right buttons off-screen at 768px.** In tablet mode the toolbar used three times the desktop spacing between tools, which pushed the collaboration and library buttons past the right edge. Mantis didn't catch this; I spotted it in the screenshots and confirmed it by measuring. The code already defines a tighter spacing for tablet mode that wasn't being used, so the toolbar now uses it (`Toolbar.tsx`).

**Dark mode**
5. **Light zoom and undo/redo boxes.** Their background was a fixed light gray, so the "100%" label was nearly invisible. They now use the theme's panel color, like the other controls (`Actions.scss`).
6. **Welcome menu labels unreadable.** "Open", "Help" and the others were dark gray on near-black (about 1.6:1 contrast). They're now light gray, mirroring light mode (`WelcomeScreen.scss`).

I also made one related change. On a first visit with no saved theme, the startup script in `excalidraw-app/index.html` assumed light, while the app itself follows the system setting. Dark-mode users saw a white page before the app loaded; it now follows the system setting too.

Mantis only checked the first screen at three sizes (360, 768 and 1440 wide). I didn't check menus, dialogs, hover states, or other pages. Mantis left an untracked `.mantis/` folder of reports and screenshots in the repo root; delete it or add it to `.gitignore`. The final overview image is `.mantis/latest/contact-sheet.png`.
