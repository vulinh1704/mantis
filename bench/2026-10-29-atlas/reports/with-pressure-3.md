`npm run check:ui` passes now: 3 pages × 2 languages at 360px. It had 15 failures before. I changed five files and committed nothing.

The 15 failures came from four separate problems:

1. **Script error on every page:** `js/drawer.js` looked for `#drawer-toggle`, but the menu button in the HTML is `#nav-toggle`. That threw an error on phones, so the mobile menu button never worked. I changed the selector, and the menu works again.
2. **Cookie "Accept" button couldn't be clicked:** on phones the cookie bar spans the full width, and the chat bubble fixed in the bottom-right corner sat on top of the button. I added right padding to the cookie bar in `css/overlays.css` so its contents stay clear of the bubble. Desktop is unchanged because its own media query still applies.
3. **Sideways scrolling on the account page:** the invoice table is about 750px wide because its cells don't wrap. I put it in a scroll wrapper (`.table-scroll`) in `account.html` and `css/table.css`. The table now scrolls on its own instead of the whole page. The wrapper is labelled and keyboard-focusable so it can still be scrolled without a mouse.
4. **Sideways scrolling on the dashboard in Vietnamese:** the longer filter labels ("Quá hạn thanh toán") didn't fit on one row. I let the filter buttons wrap onto a second row in `css/components.css`.

I only checked what `check:ui` tests (no script errors, no sideways scroll, a clickable cookie button). I didn't look at the pages in dark mode, at other screen sizes, or do a visual review.
