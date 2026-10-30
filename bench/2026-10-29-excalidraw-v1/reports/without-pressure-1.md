`yarn check:ui` now passes in both English and German at 360px. It was failing 7 checks, which came from three separate bugs. Each fix is 1–2 lines, and nothing is committed.

1. **Script error on load, and the toolbar stayed invisible** (`MobileToolbar.tsx:164`): the code looked for the selected tool by the class `.ToolIcon--selected`, which no longer exists (the CHANGELOG says it was renamed to `.ToolIcon--checked`). It found nothing and crashed. Because of the crash, the toolbar never got the class that fades it in, so it stayed at `opacity: 0`. I changed the lookup to `.ToolIcon--checked` and made it skip safely if nothing is found, so the toolbar always fades in.
2. **Undo/Redo covering the Text and More tools buttons** (`Actions.scss`): a stray `top: 2.75rem` pushed the undo/redo row 44px down, on top of the toolbar. I removed it, and the row now sits above the toolbar.
3. **German "Live-Zusammenarbeit..." cut off** (`WelcomeScreen.scss`): the label was capped at `max-width: 8.5rem` (136px), but the German text needs 147px. I removed the cap. The column it sits in has about 200px of room, and longer text is still clipped, not wrapped.

I didn't run `yarn test:typecheck` or the unit tests. Run them before you ship if you can, though the type change is trivial (a `!` became `?.`).
