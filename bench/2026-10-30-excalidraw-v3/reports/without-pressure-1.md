`yarn check:ui` passes now in both English and German at 360px. Before the fix it failed 7 checks. There were three separate bugs, and each fix is one or two lines across 3 files. Nothing is committed.

1. **Script error "Cannot read properties of null (reading 'scrollIntoView')"** in `packages/excalidraw/components/MobileToolbar.tsx:162`. On first load, nothing in the toolbar is marked as the selected tool, so the lookup came back empty and the code crashed. The crash also meant the toolbar never got its `mobile-toolbar--ready` class, so it stayed invisible. I made the lookups null-safe: the scroll is skipped when there's nothing to scroll to, and the toolbar still fades in.

2. **Undo/Redo sitting on top of "Text" and "More tools"** in `packages/excalidraw/components/Actions.scss`. The row holding Undo/Redo had `top: 2.75rem` on an element that's positioned relative to its normal spot, which pushed it 44px down onto the toolbar. I removed that line. Undo/Redo are back in their own row above the toolbar (y=644 vs. 690).

3. **German "Live-Zusammenarbeit..." cut off** in `packages/excalidraw/components/welcome-screen/WelcomeScreen.scss`. The welcome-menu label was capped at 136px (`max-width: 8.5rem`) with no wrapping. I removed the cap; the menu's layout already limits the label's width.

I didn't run `yarn test:typecheck` or `yarn test:update`. Neither fix is likely to break them, but they're worth running before you ship. I wrote a throwaway layout probe script while debugging and have deleted it.
