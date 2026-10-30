`npm run check:ui` now passes: 3 pages × 2 languages at 360px. The change is small and uncommitted (5 files, 18 insertions, 15 deletions).

What was broken and what I changed:

1. **Script errors on every page** — `js/drawer.js` looked up `#drawer-toggle`, but the button's id is `#nav-toggle`. Fixed the selector.
2. **Sideways scroll on the Vietnamese home page** — the filter buttons sat in a non-wrapping flex row, and the Vietnamese labels are longer. Added `flex-wrap: wrap` to `.filters` in `css/components.css`.
3. **Sideways scroll on the account page** — the invoice table's nowrap cells (one customer name is very long) overflowed a 360px screen. Wrapped the table in a `.table-scroll` div with `overflow-x: auto` (`account.html`, `css/table.css`), so the table scrolls inside its own box instead of the whole page.
4. **Cookie button not clickable** — the chat bubble (z-index 50) covered the cookie bar (z-index 40). Raised `.cookie` to z-index 60 in `css/overlays.css`, so the notice sits above the bubble while it's visible.

I didn't run the mantis UI skill or check light/dark mode or contrast beyond what the script covers. Note that `--text-muted` (`#a1a1aa`) on white is low contrast, which the check doesn't test. I left it alone to keep the change small.
