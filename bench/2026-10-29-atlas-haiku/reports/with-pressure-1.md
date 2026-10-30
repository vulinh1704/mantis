`npm run check:ui` now passes: 3 pages × 2 languages at 360px. The fix is four one-line changes, not committed.

The check had four separate causes:

- **Script error on every page** (`js/drawer.js`): it looked for `#drawer-toggle`, but the buttons use `#nav-toggle`. Changed the selector to `#nav-toggle`.
- **Cookie button "cannot be clicked"** (`css/overlays.css`): the chat bubble (z-index 50) sat over the cookie bar (z-index 40). Raised `.cookie` to z-index 60 so the consent notice is on top.
- **Sideways scroll on `/account.html`** (`css/table.css`): the five-column invoice table with `nowrap` cells was about 760px wide. Made `.invoices` a block with `overflow-x: auto`, so the table scrolls inside its own box.
- **Sideways scroll on `/` in Vietnamese** (`css/components.css`): the long Vietnamese filter labels overflowed the row. Added `flex-wrap: wrap` to `.filters`.

Two things to check before shipping:

- The invoice table now scrolls horizontally inside the table on phones rather than fitting. That's the smallest change, but it's a judgment call if the design needs all columns visible.
- I only ran the check. I did not manually test the mobile nav drawer open/close, though the selector fix is the only change to that code path.
