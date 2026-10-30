I found and fixed nine problems on the first screen. Most came from a handful of CSS rules, plus one runtime error that left the phone toolbar empty. To check, I took screenshots with Playwright of the app at localhost:3001 on phone (375×667), tablet portrait and landscape, and desktop, in English and German, light and dark, before and after the fixes. The typecheck passes and the related test suites pass (61 tests). I didn't run the full suite, and nothing is committed.

**Phones**
1. **The bottom toolbar was empty**, and the page threw `Cannot read properties of null (reading 'scrollIntoView')`. `MobileToolbar.tsx` looked for `.ToolIcon--selected`, but the class is actually `.ToolIcon--checked`. The lookup crashed, so the toolbar never faded in. I fixed the class name and made the lookup null-safe.
2. **Undo/redo sat on top of the tools.** A stray `top: 2.75rem` on `.mobile-shape-actions` in `Actions.scss` pushed that row down onto the toolbar. Removed.

**Tablets**
3. **In portrait, the share and library buttons were pushed off-screen.** In `Toolbar.tsx`, tablet mode used 12px gaps between tools instead of 4px (`gap={isCompactStylesPanel ? 3 : 1}`). That made the toolbar too wide for the top bar. It now uses 4px everywhere.
4. **In landscape (768px tall), the welcome hints were hidden.** They were set to hide on any screen under 780px tall; I changed the cutoff to 599px. I also added height-based top margins to the centre block so the "Wähle ein Werkzeug…" arrow no longer overlaps the logo.

**Dark mode**
5. **The zoom and undo/redo controls had a hard-coded light background.** They now use `--color-surface-low`, which keeps the same light look and has a dark-theme value.
6. **The welcome menu items were nearly invisible**: #3d3d3d text on a #121212 background. Changed to `gray-60`.
7. **The share button ("Teilen") was hard to read in both themes.** Its background now uses `--color-primary`.

**German**
8. **Welcome menu labels were cut off** at 8.5rem with no wrapping (for example "Live-Zusammenarbeit…"). That limit is removed.
9. **The long panning hint wrapped under the toolbar on desktop** and ran into the arrow. The stylesheet declared a wide-screen breakpoint variable that was never used, so I added a rule for it that keeps the hint on one centred line on wide screens.

One minor thing is left: on a tablet in portrait, the German panning hint ("Halte Mausrad oder Leertaste…") still wraps to two lines, and the arrow tip just touches the last word. That hint is about mouse and keyboard, so it doesn't help touch users anyway. I can hide it on touch screens if you like.

The screenshots are in `%TEMP%\claude\mantis-bench-x-without-neutral-3\43f56303-dc20-4480-ae43-e1411c0fe2f0\scratchpad\before` and `%TEMP%\claude\mantis-bench-x-without-neutral-3\43f56303-dc20-4480-ae43-e1411c0fe2f0\scratchpad\after`.

Files changed:
- `packages/excalidraw/components/MobileToolbar.tsx`
- `packages/excalidraw/components/Toolbar.tsx`
- `packages/excalidraw/components/Actions.scss`
- `packages/excalidraw/components/HintViewer.scss`
- `packages/excalidraw/components/welcome-screen/WelcomeScreen.scss`
- `packages/excalidraw/components/live-collaboration/LiveCollaborationTrigger.scss`
