`npm run check:ui` passes now: "3 pages × 2 languages at 360px". I didn't touch the check script, and nothing is committed.

**What was breaking it (15 failures, 4 causes):**
1. **Script error on every page:** `js/drawer.js` was looking for a menu button called `#drawer-toggle`, but the button is `#nav-toggle`. The script crashed and the phone menu never opened. I fixed the name.
2. **Cookie button couldn't be clicked:** the fixed support-chat bubble sat on top of the Accept button. I added 88px of right padding to the cookie bar on narrow screens so the button stays clear of the bubble (`css/overlays.css`). Above 900px the cookie notice is a floating box on the left and is unchanged.
3. **Dashboard scrolled sideways in Vietnamese (564px):** the filter buttons were in a row that couldn't wrap, and the longer Vietnamese labels pushed it past the screen. The row now wraps (`css/components.css`).
4. **Account page scrolled sideways (757px/792px):** the invoice table had nothing to contain its width. I wrapped it in a `.table-scroll` box so the table scrolls inside itself and every column is still reachable. The box can be reached and scrolled with the keyboard and is labelled by the page heading (`account.html`, `css/table.css`).

**Checks:**
- **Mantis (UI checker):** errors went from 15 to 8. The last run shows 8 fixed · 0 new · 0 cover-ups · 0 lost.
- **Revert-proof:** with my changes taken out, `check:ui` failed again with the same 15 failures and Mantis showed 15 errors. With them put back, it passes again.
- The project has no tests, linter or type check to run.

**Still open, but not part of `check:ui`, so I left them alone:**
- **Contrast:** grey caption, table-header and label text (`--text-muted`) is too faint in light mode, at about 2.5:1 against the required 4.5:1.
- **Dark mode on the dashboard:** the promo card on the dashboard stays white because its background is hard-coded in `.card--promo`.
- **Missing image:** the pricing page asks for `/img/plans-dark.svg` in dark mode, and that file doesn't exist (404).
- **Small social icons:** the footer social icons are 18px, below the 24px minimum tap size.
- **Account page jumps while loading:** the invoice table loads in and pushes the content below it down. This is milder after the change (layout-shift score 0.169, down from 0.655) but still over the 0.1 limit.
