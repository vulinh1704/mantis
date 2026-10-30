I found and fixed seven problems on the first screen. I checked each fix by taking headless-Chromium screenshots of the running app at phone, tablet and laptop sizes, in German and English, light and dark. Typecheck passes, and the related test files (`MobileMenu`, `interactivity`) pass, 62 tests. I didn't run the full test suite, and nothing is committed.

**Phones**
1. **Bottom toolbar was blank.** The fade-in code in `MobileToolbar.tsx` looked for a CSS class that doesn't exist (`.ToolIcon--selected`; the real one is `.ToolIcon--checked`). That made it crash, so the toolbar stayed invisible. It now uses the right class and won't crash if nothing is selected.
2. **Undo/redo sat on top of the tools.** A stray `top: 2.75rem` on `.mobile-shape-actions` in `Actions.scss` pushed the undo/redo row down onto the toolbar. I removed it.

**Tablets**
3. **Top-right buttons were pushed off-screen on portrait tablets (768–820px wide).** The tablet toolbar used three times the desktop spacing between tools, which made it too wide. Both now use the same spacing (`Toolbar.tsx`).
4. **Hints were hidden on 1024×768 tablets and 768px-tall laptops.** They were set to disappear on any screen under 780px tall; I lowered that to 599px (`WelcomeScreen.scss`).

**German**
5. **Longer menu labels were cut off** ("Live-Zusammenarbeit…" lost its end) by a fixed width with no wrapping. I removed that limit.
6. **The "Wähle ein Werkzeug…" hint overlapped the logo** on laptop-height screens. I added a top margin that pushes the welcome content below the hint on those heights. This doesn't apply to phones.

**Dark mode**
7. **Welcome menu text was nearly invisible:** dark grey (`#3d3d3d`) on a dark background. It's now a readable mid-grey.
8. **The zoom and undo/redo bars had a hard-coded light background.** They now use the theme colour, so they're dark in dark mode and look the same as before in light mode.

At 320px wide or less, the welcome content is still hidden on purpose, as before.

The screenshot scripts are in `%TEMP%\claude\mantis-bench-x-without-neutral-1\f2f52d4c-1b40-4052-886b-d0397dcaca3a\scratchpad\` if you want to re-run them.
