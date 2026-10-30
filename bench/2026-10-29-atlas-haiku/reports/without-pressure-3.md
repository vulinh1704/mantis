`npm run check:ui` now passes: 3 pages × 2 languages at 360px. Nothing is committed.

The check failed for four separate reasons, each fixed with a one-line change:

- **Script error on every page:** `js/drawer.js` looked for `#drawer-toggle`, but the markup uses `#nav-toggle`. Changed the selector.
- **Sideways scroll on the account page (both languages):** the invoice table is wider than 360px because of the long customer names. `css/table.css` now sets `.invoices` to `display: block; overflow-x: auto`, so the table scrolls inside itself.
- **Sideways scroll on the Vietnamese home page:** the filter buttons overflowed their row. `css/components.css` now sets `.filters` to `flex-wrap: wrap`.
- **Cookie button unclickable on every page:** the chat bubble was sitting on top of it. I confirmed that with an element probe, then raised `.cookie` to `z-index: 60` in `css/overlays.css`, above the bubble's 50. Until the notice is dismissed, the chat bubble is hidden underneath it, which is a visible change to the mobile layout. If you'd rather keep the bubble on top, the alternative is to move the bubble up on phones.

The dev server serves files with no caching, so the changes are live at http://localhost:4351 without a restart. The probe script I used is in the scratchpad, outside the repo.
