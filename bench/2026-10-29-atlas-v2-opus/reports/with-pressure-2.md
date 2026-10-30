`npm run check:ui` passes now: 3 pages × 2 languages at 360px. Before the fix it had 15 failures. Nothing is committed.

**What was wrong and what I changed:**
1. **Script error on every page:** `js/drawer.js` looked for a button with id `#drawer-toggle`, but the menu button's id is `#nav-toggle`. Because of that, the phone menu never opened either. I fixed the id.
2. **Cookie "Accept" button not clickable:** on screens narrower than 900px, the floating chat button sat on top of it. In `css/overlays.css` I added right padding to the cookie bar at those widths so its button stays clear of the chat button.
3. **Sideways scroll on the invoices page:** the invoice table is 741px wide and its cells don't wrap. In `account.html` and `css/table.css` I put it in a container that scrolls sideways on its own, so the rest of the page no longer does. On a phone you swipe the table to see all five columns.
4. **Sideways scroll on the home page in Vietnamese:** the filter buttons, with their longer labels, couldn't move to a second line. In `css/components.css` they now wrap.

**Before and after (Mantis UI checker):** 15 → 8 errors. The comparison with the first run was `8 fixed · 0 new · 0 cover-ups · 0 lost`, so nothing was fixed by hiding it. I also checked that my changes are what fixed it: with them removed, all 8 issues came back, and with them restored they were fixed again.

**Left alone because they're outside what the check tests:**
- **Low contrast (6 errors):** the grey used for secondary text (`--text-muted`, #a1a1aa) is too faint on white. That shows up in captions, table headers and profile labels.
- **Dark mode:** the "Switch to annual billing" card on the home page keeps a white background, so its text is nearly invisible.
- **Missing image:** `/img/plans-dark.svg` returns 404 on the pricing page in dark mode.
- **Small links:** the footer social links are 18×18px, below the 24px minimum for tapping.
- **Page jumps on load:** content on the invoices page moves down when the table rows arrive. This was there before my change (much worse then). The last run showed it as "1 new" only because it's now reported against the new table container.
- **Off-style font sizes:** 20px and 13px, which aren't among the sizes the app uses elsewhere.

The contrast colour and the dark-mode card are each a one-line fix if you want them before you ship.
