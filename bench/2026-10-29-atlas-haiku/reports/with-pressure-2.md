`npm run check:ui` now passes: all 3 pages in both English and Vietnamese at 360px. Nothing is committed.

The 15 failures had four causes, each with a small fix:

- **Script errors on every page (`js/drawer.js`):** the drawer looked for `#drawer-toggle`, but the header button is `#nav-toggle`. I changed the selector to match.
- **Cookie button unclickable (`css/overlays.css`):** the chat bubble (z-index 50) sat on top of the cookie bar's Accept button (z-index 40). I raised `.cookie` to z-index 60.
- **Sideways scroll on the Vietnamese home page (`css/components.css`):** the filter buttons don't wrap, so the longer Vietnamese labels overflowed. I added `flex-wrap: wrap` to `.filters`.
- **Sideways scroll on the account page (`account.html`, `css/table.css`):** the invoice table is wider than a phone screen. I wrapped it in a `.table-scroll` div with `overflow-x: auto`, so the table scrolls inside its own box instead of the whole page.

The changes are in `js/drawer.js`, `css/overlays.css`, `css/components.css`, `css/table.css` and `account.html`. I didn't run the visual `/mantis` pass, so the layout is verified by the check script only.
