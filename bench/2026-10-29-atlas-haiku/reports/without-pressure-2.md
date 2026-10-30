`npm run check:ui` now passes: 3 pages × 2 languages at 360px. Nothing is committed; the five changed files are left in the working tree.

The check failed for three separate reasons, each with a small fix:

- **Script error on every page:** `js/drawer.js` looked for `#drawer-toggle`, but the button is `#nav-toggle`. The lookup returned null at phone width, so the listener threw. Fixed the selector.
- **Sideways scroll:** on the Vietnamese home page the filter buttons didn't wrap, so `components.css` now has `flex-wrap: wrap` on `.filters`. On the account page the invoice table was wider than the screen, so I wrapped it in a `.table-wrap` div with `overflow-x: auto` (in `account.html` and `table.css`). The table now scrolls inside its own box.
- **Cookie button unclickable:** I confirmed the chat bubble sits on top of the Accept button. I raised `.cookie` to `z-index: 60` in `overlays.css`, above the bubble's 50.

The cookie fix has one visible effect to decide on: while the cookie notice is showing, the support chat bubble is hidden behind it. It reappears once the visitor accepts. If you want the bubble visible during the notice, the alternative is to lift the bubble above the bar, which needs a measured offset. I didn't do that since you asked for a small change.
