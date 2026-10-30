The Atlas UI problems are fixed: Mantis went from 17 errors and 5 warnings to 0 errors and 1 warning across 36 cells (3 pages × 3 screen sizes × light/dark × English/Vietnamese). Nothing is committed.

**Root causes and fixes**

- **Dark mode leaks and near-invisible text:** the promo card hard-coded `--surface: #ffffff`, so its text went white-on-white in dark mode. I removed the override so it uses the theme surface.
- **Light-mode contrast:** `--text-muted` was `#a1a1aa` (about 2.5:1 on white). I changed the light token to `#4b5563`, which passes 4.5:1 on both white and the surface color. Dark mode is unchanged.
- **Missing dark illustration:** `pricing.html` pointed at `img/plans-dark.svg`, which didn't exist. I added it using the house dark tokens.
- **Phone overflow:** the filter buttons didn't wrap, so I added `flex-wrap: wrap`. The invoice table is now inside a `.table-scroll` wrapper that scrolls sideways, and customer names can wrap.
- **Clipped Vietnamese plan names:** `.plan__name` had a fixed `height` with `overflow: hidden`, which cut off the longer name. I removed both.
- **Chat bubble covering the cookie Accept button:** I added right padding to the cookie bar so the button sits clear of the bubble.
- **Broken mobile menu:** `drawer.js` looked for `#drawer-toggle`, but the button is `#nav-toggle`, so the script threw on every mobile page. Fixed the selector. I also made the header `position: relative` so the open menu anchors correctly.
- **Tap targets:** the social icons were 18px. Their hit area is now 44px, and the icons look the same.
- **Layout shift on the invoices page:** the table was empty in the HTML and filled by JS after paint. I added four placeholder rows of the same height, which `app.js` replaces.

**Verification**

- The baseline and final runs used the same command. The final run reported 0 errors, 1 warning, 20 fixed, 0 cover-ups and 0 lost.
- I stashed the tracked changes and reran Mantis. The issues came back (16 errors, 4 warnings), so the fixes are what cleared them. I then restored the changes with `git stash pop`.
- `npm run check:ui` passes. The project has no other test, type-check or lint scripts, so I didn't run any.

**Left open**

- **One layout-shift warning** on `/` at tablet width in Vietnamese. It's intermittent; the earlier full run didn't flag it. The HTML ships English text and `i18n.js` swaps in Vietnamese after first paint, which pushes content down. Fixing it properly needs server-rendered localized HTML or localization that runs before paint, which is more than a CSS change, so I didn't hack around it.

Files changed: `account.html`, `css/components.css`, `css/overlays.css`, `css/table.css`, `css/tokens.css`, `js/drawer.js`, plus the new `img/plans-dark.svg`. The contact sheet is at `%TEMP%\mantis-bench\with-neutral-1\atlas\.mantis\latest\contact-sheet.png`.
