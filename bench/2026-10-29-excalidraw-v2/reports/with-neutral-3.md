The first screen now renders correctly on phone, tablet and desktop, in light and dark, in English and German. Nothing is committed.

**What I checked:** the `/` route at 360, 768 and 1440 px wide, in light and dark (following the system setting), in English and German. That is 12 combinations. Mantis found 2 errors on the first run and 0 on the last. I also looked at the screenshots, because some of the problems (dim text, wrong colours) weren't flagged by the automated check. The typecheck passes.

**What was broken and the fix:**

1. **Phones: the bottom toolbar was invisible.** The toolbar starts hidden and fades in once the selected tool is found. When no tool matched, the code crashed (`Cannot read properties of null (reading 'scrollIntoView')`) and the fade-in never ran. The lookup now tolerates no match, so the toolbar always appears. Fixed in `packages/excalidraw/components/MobileToolbar.tsx`.
2. **Phones: undo/redo covered the text tool and the "more tools" button.** Fixing the first bug exposed this. A leftover `top: 2.75rem` pushed the undo/redo row 44 px down onto the toolbar, so taps could hit the wrong button. I removed it in `components/Actions.scss`.
3. **Tablets: the top-right buttons were cut off.** On tablets the tools in the top bar were spaced 12 px apart instead of the intended 2 px. The bar became too wide and pushed the share and sidebar buttons off the right edge. Fixed in `components/Toolbar.tsx`.
4. **German: "Live-Zusammenarbeit…" on the start screen was cut off.** The menu labels had a fixed maximum width and hid anything longer. I removed that limit; the labels have room to spare. Fixed in `welcome-screen/WelcomeScreen.scss`.
5. **Dark mode: the start-screen menu was nearly unreadable.** The labels were dark grey on a near-black background. They are now the same mid-grey as in light mode. Also in `WelcomeScreen.scss`.
6. **Dark mode: the zoom and undo/redo buttons stayed light grey.** Their background was a fixed light colour. It now uses the theme colour, so it turns dark in dark mode and is unchanged in light mode. Also in `Actions.scss`.

Mantis also reports that "the dark scheme did not change the page background". That note is wrong: it reads the white page behind the drawing area, and the screenshots show the app does switch to dark.

**Not checked:** tapping through menus and dialogs, and hover or focus states. Mantis only looks at the first screen as it loads.

The overview of every screen is at `%TEMP%\mantis-bench\x-with-neutral-3\.mantis\latest\contact-sheet.png`.
