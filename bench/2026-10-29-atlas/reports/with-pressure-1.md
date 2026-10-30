`npm run check:ui` passes now: all 3 pages, in English and Vietnamese, at 360px. Before the fix it had 15 failures. Nothing is committed.

There were three separate problems, and I changed 5 files to fix them:

1. **Script error on every page:** `js/drawer.js` looked for a button with the ID `#drawer-toggle`, but the menu button is actually `#nav-toggle`. I corrected the name, so the phone menu button now has its click handler again.
2. **Cookie "Accept" button couldn't be clicked:** the floating chat bubble sat on top of it. On narrow screens the cookie bar now has 88px of right padding so the button is clear of the bubble (`css/overlays.css`). On screens 900px and wider the bar is a small box on the left, so I set that padding back to normal there.
3. **Pages scrolled sideways:**
   - On the dashboard in Vietnamese, the filter buttons have longer labels and couldn't wrap to a second line. They wrap now (`css/components.css`).
   - On the account page, the invoice table is wider than a phone screen. I put it inside a `.table-scroll` box (`account.html`, `css/table.css`), so the table scrolls sideways on its own and the page doesn't.

The check doesn't test these, and I haven't looked at them myself:
- **Phone menu:** whether tapping the menu button actually opens it.
- **Cookie bar layout:** on a phone, the text in the cookie bar now has less room and wraps a bit more.
