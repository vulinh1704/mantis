I found and fixed 7 problems on the first screen. I checked each fix with screenshots of the running app on phone, tablet (portrait and landscape) and desktop, in English and German, light and dark. All of them now look right and the page no longer throws errors. Nothing is committed.

**Phones**
1. **The drawing toolbar was blank.** On load the toolbar looked for a CSS class that has since been renamed. The lookup came back empty, the code crashed, and the toolbar stayed invisible. It now uses the current class name and can't crash if nothing is found. (`MobileToolbar.tsx`)
2. **Undo/redo sat on top of the last tool.** A stray offset pushed the undo/redo row down over the toolbar. I removed it, so the row sits above the toolbar again. (`Actions.scss`)

**German**
3. **"Live-Zusammenarbeit…" was cut off.** The welcome menu labels had a fixed maximum width and clipped anything longer, so the full German labels didn't fit. I removed that limit. (`WelcomeScreen.scss`)

**Dark mode**
4. **The welcome menu items were almost invisible.** Their text was set to a near-black gray. I changed it to the same mid gray the shortcut hints use, which is readable on the dark background. (`WelcomeScreen.scss`)
5. **The zoom and undo/redo buttons kept a light background** with unreadable text. The color was hard-coded instead of following the theme. It now uses the theme's matching color, so light mode looks the same as before and dark mode is correct. (`Actions.scss`)

**Tablets**
6. **The buttons in the top-right corner were pushed off-screen.** On tablets the toolbar used three times the spacing it uses on desktop, which made it about 26px too wide. I swapped this so the tablet toolbar is now tighter than the desktop one, not wider. (`Toolbar.tsx`)

**All sizes**
7. **The Share ("Teilen") button had white text on a very pale purple**, which made it look disabled. It now has the solid purple background. (`LiveCollaborationTrigger.scss`)

The type check passes, and so do the 191 tests in the 16 test files closest to these changes. I didn't run the full test suite (`yarn test:update`); run it before you commit.

Not changed:
- **English text in the German version:** "Sign up" and "Try Excalidraw+ / 14-day free trial" are written directly into the web app and have no German translation.
- **Tight spacing on a landscape tablet in German:** the German "Wähle ein Werkzeug & beginne zu zeichnen!" hint wraps onto four lines and ends just above the logo, without overlapping it.
