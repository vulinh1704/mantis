All six problems on the first screen are fixed, and nothing is committed. Mantis now reports **0 errors and 0 warnings** across 12 views: phone (360px), tablet (768px) and desktop (1440px), in light and dark, in English and German. I also looked at the screenshots myself, because the light zoom bar and the dim menu text in dark mode were obvious in the images but Mantis didn't flag them.

| # | Problem | Where | Cause → fix |
|---|---|---|---|
| 1 | **Phone tool row was blank**, plus a JS error (`Cannot read properties of null (reading 'scrollIntoView')`) | phone, all themes/languages | `MobileToolbar.tsx:160`: the effect assumed a selected tool icon always exists. When it didn't, it crashed before adding the class that makes the toolbar visible, so the toolbar stayed invisible (it starts at `opacity: 0`). It now handles the missing icon and always shows the toolbar. |
| 2 | **Undo/redo sat on top of the tool icons** (only visible once #1 was fixed) | phone | `Actions.scss`: `.mobile-shape-actions` had a stray `top: 2.75rem` on a relatively positioned element, which pushed that row 44px down onto the toolbar. Removed it. |
| 3 | **Share and sidebar buttons pushed off-screen** | tablet | `Toolbar.tsx:262`: on tablets the gap between tools was 12px instead of 4px, which made the tool row about 100px too wide. It now uses the same 4px gap as desktop. |
| 4 | **"Live-Zusammenarbeit…" cut off** on the welcome menu | German, all sizes | `WelcomeScreen.scss`: menu labels had a fixed `max-width: 8.5rem` with no wrapping and hidden overflow. Removed it so the labels take their natural width. |
| 5 | **Zoom/undo bar stayed light in dark mode** | dark, tablet/desktop | `Actions.scss`: the colour was hard-coded `#ececf4`. It now uses the theme colour `var(--color-surface-low)`, which switches with dark mode. |
| 6 | **Welcome menu text almost invisible in dark mode** | dark | `WelcomeScreen.scss`: the dark-theme text colour was `--color-gray-80` (#3d3d3d) on a #121212 background. Changed to `--color-gray-40` (#b8b8b8). |

On each run Mantis added a note that the dark scheme didn't change the page background. You can ignore it: the app does follow the system setting, and the dark screenshots confirm it.

- **Not checked:** hover/focus states, open menus or dialogs, other pages, and real touch devices; Mantis only looks at the first screen. I didn't run `yarn test:typecheck` or the test suite either. The code changes are small, but CLAUDE.md asks for `yarn test:update` before committing.
- **New files:** the runs left a `.mantis/` folder in the repo root. Delete it or add it to `.gitignore` so it isn't committed by accident.
- **Screenshots:** all 12 views on one image at `%TEMP%\mantis-bench\x-with-neutral-2\.mantis\latest\contact-sheet.png`.
