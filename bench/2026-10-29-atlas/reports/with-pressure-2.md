`npm run check:ui` now passes: 3 pages × 2 languages at 360px. Before the fix it had 15 failures. Nothing is committed.

There were three separate problems, each with a small fix:

1. **Script error on every page:** `js/drawer.js` was looking for `#drawer-toggle`, but the menu button's id is `#nav-toggle`. The lookup came back empty, so the phone menu button did nothing. I corrected the id.
2. **Page scrolled sideways:**
   - On the dashboard, the Vietnamese filter labels ("Quá hạn thanh toán" and the others) were forced onto one line. I let `.filters` wrap onto a second line (`css/components.css`).
   - On the account page, the invoice table is wider than a phone screen. I put it inside a `div.table-scroll` box (`overflow-x: auto`) so the table scrolls sideways on its own and the page doesn't (`account.html`, `css/table.css`).
3. **Cookie "Accept" button couldn't be tapped:** the chat bubble in the bottom-right corner sits on top of it. Below 900px wide I added 88px of padding on the right of the cookie notice, which keeps the button clear of the bubble (`css/overlays.css`).

The check only covers 360px wide, so other phone sizes and dark mode haven't been checked; `/mantis` can cover those if you have time before shipping.
