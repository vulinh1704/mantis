I fixed six problems on the first screen. Mantis now reports 0 errors and 0 warnings, down from 2 errors, across phone (360px), tablet (768px) and desktop (1440px), in light and dark mode, in English and German. The typecheck passes. Nothing is committed.

**Phones**
1. **The bottom toolbar was invisible.** It only fades in after scrolling the active tool into view, and the code looked for `.ToolIcon--selected`, a class that no longer exists (it's now `.ToolIcon--checked`). That threw an error and the toolbar never appeared. I switched to the current class and made the lookup safe if nothing matches. (`MobileToolbar.tsx`)
2. **Undo/redo sat on top of the last toolbar buttons.** This only showed up once the toolbar was visible again. `.mobile-shape-actions` had a stray `top: 2.75rem`, which pushed that row 44px down onto the toolbar. I removed the offset. (`Actions.scss`)

**Tablets**
3. **The top toolbar pushed the Share button off the right edge.** In compact mode the gap between tools was 3 instead of 1, so the toolbar got wider exactly when space was tight: 814px of content in 736px. I set the compact gap to 0.5 and it now fits. (`Toolbar.tsx`)

**German**
4. **"Live-Zusammenarbeit…" was cut off** on the welcome screen. The menu text had a fixed `max-width: 8.5rem` with hidden overflow. I removed that limit. (`WelcomeScreen.scss`)

**Dark mode**
5. **The zoom and undo/redo boxes stayed light grey.** Their background was a hardcoded `#ececf4`. They now use the `--color-surface-low` theme color, which looks the same in light mode and turns dark in dark mode. (`Actions.scss`)
6. **The welcome menu text was nearly unreadable:** `#3d3d3d` on a near-black background. It's now `--color-gray-50` (`#999`). (`WelcomeScreen.scss`)
7. **A first-time visitor got a white flash.** The early theme script in `index.html` treated "no saved preference" as light, while the app treats it as "follow system". It now follows the system setting too, so the page starts dark straight away.

I only checked the first screen as it loads. Menus, dialogs and hover states weren't opened. The latest screenshots are in `%TEMP%\mantis-bench\x-with-neutral-2\.mantis\latest\contact-sheet.png`.
