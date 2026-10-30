`npm run check:ui` now passes on all 3 pages in English and Vietnamese at 360px wide. I also ran a quick separate check at phone size: the menu button opens the nav, and the cookie notice's Accept button closes it. Nothing is committed.

The failures had three causes, each with a small fix:

1. **Script error on every page:** `js/drawer.js` looked for a menu button called `#drawer-toggle`, but the pages name it `#nav-toggle`. This also meant the phone menu never opened. I changed it to `#nav-toggle`.
2. **Cookie button couldn't be clicked:** on phones the floating chat bubble sat on top of the cookie notice's Accept button. Below 900px wide, the cookie bar now leaves room on the right for the bubble (`css/overlays.css`).
3. **Pages scrolled sideways:**
   - Home page in Vietnamese: the filter buttons have longer labels and couldn't wrap onto a second line. They can now (`css/components.css`).
   - Invoices page: the table cells can't wrap. I put the table in a container that scrolls sideways on its own, so the page itself doesn't (`account.html` and a `.table-scroll` rule in `css/table.css`).

Five files changed, about 10 lines in all.
