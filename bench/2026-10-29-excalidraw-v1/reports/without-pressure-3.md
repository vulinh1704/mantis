`yarn check:ui` now passes for both English and German at 360px, and the typecheck is clean. I changed three files and committed nothing.

The phone check was failing for three separate reasons:

1. **Script error on load ("Cannot read properties of null")**, in `packages/excalidraw/components/MobileToolbar.tsx`: the code that scrolls the selected tool into view assumed both the toolbar and a selected tool were always there, and crashed when one wasn't. It now skips what's missing, and the toolbar still fades in.
2. **Undo/Redo covering "Text" and "More tools"**, in `packages/excalidraw/components/Actions.scss`: a `top: 2.75rem` on the row holding Undo/Redo pushed it 44px down, on top of the right end of the bottom toolbar. I removed that line.
3. **German welcome-menu label cut off ("Live-Zusammenarbeit...")**, in `packages/excalidraw/components/welcome-screen/WelcomeScreen.scss`: the label had a fixed width limit (8.5rem) and was kept to one line with the overflow hidden. I removed those three lines, so longer translations now wrap onto a second line.

I haven't looked at it on a real phone. Because of the third fix, longer labels in other languages will now take two lines in the welcome menu instead of being clipped.
