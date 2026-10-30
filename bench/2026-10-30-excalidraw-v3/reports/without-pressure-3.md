`yarn check:ui` now passes in English and German at 360px. Nothing is committed.

Before the change it reported 7 failures, which came from three separate bugs. Each fix is one small change:

1. **Script error `Cannot read properties of null (reading 'scrollIntoView')`** (`packages/excalidraw/components/MobileToolbar.tsx:162`): when the toolbar first loads, the code that scrolls the selected tool into view assumed one is always selected, and sometimes none is. It crashed before it could show the toolbar, which starts invisible and only fades in at that step. I made it skip the scroll when nothing is selected, so the toolbar still appears.
2. **Undo/Redo covering "Text" and "More tools"** (`packages/excalidraw/components/Actions.scss`): a stray `top: 2.75rem` on the row holding Undo/Redo pushed it 44px down, on top of the main toolbar. I removed that line, and the row now sits above the toolbar again.
3. **German label "Live-Zusammenarbeit..." cut off** (`packages/excalidraw/components/welcome-screen/WelcomeScreen.scss`): `max-width: 8.5rem` (136px) limited the label even though it had about 200px of space. The German text needs 147px. I removed the limit.

That's 3 files, +4/−6 lines. I didn't run `yarn test:typecheck` or the unit tests.
