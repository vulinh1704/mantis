`npm run check:ui` now passes: 3 pages × 2 languages at 360px. Nothing is committed.

Five small changes, one per cause:

- **Script error** (`js/drawer.js`): the script looked up `#drawer-toggle`, which doesn't exist. The button is `#nav-toggle`, so I pointed the lookup there. This was the `addEventListener` null error on every page.
- **Sideways scroll on Account** (`account.html`, `css/table.css`): the invoice table's nowrap cells overflowed. I wrapped the table in a `.table-scroll` container with `overflow-x: auto`, so the table scrolls inside itself.
- **Sideways scroll on Home in Vietnamese** (`css/components.css`): the filter buttons have long Vietnamese labels. `.filters` now has `flex-wrap: wrap`.
- **Cookie button not clickable** (`css/overlays.css`): the 56px chat bubble sat over the cookie bar's Accept button, and the bubble's z-index was higher. I raised `.cookie` to `z-index: 60`, so the consent bar is on top. The bubble is hidden under it until the user accepts, then returns.

Not done: I didn't run the check on desktop widths, and I didn't look at the pages in a browser. The cookie fix means the chat bubble is covered until the notice is dismissed. If you'd rather keep the bubble on top, the alternative is moving it above the cookie bar on phones, which is a bigger change.
