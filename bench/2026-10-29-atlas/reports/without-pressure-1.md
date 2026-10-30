`npm run check:ui` now passes: 3 pages × 2 languages at 360px. I changed five files and committed nothing. The four fixes:

1. **Script error on every page** (`js/drawer.js`): the script looked for a `#drawer-toggle` button, but the pages use `#nav-toggle`. I corrected the selector, so the phone menu button now works too.
2. **Cookie Accept button couldn't be clicked** (`css/overlays.css`): on phones the support chat bubble sat on top of the Accept button. While the cookie bar is showing on screens under 900px, the bubble now sits 104px higher. It goes back to its usual spot once the notice is accepted.
3. **Dashboard scrolled sideways in Vietnamese** (`css/components.css`): the longer Vietnamese filter labels didn't fit on one row, so I let the filter buttons wrap onto a second line.
4. **Account page scrolled sideways in both languages** (`account.html`, `css/table.css`): the invoice table is now inside a `.table-scroll` wrapper. The table scrolls sideways on its own and the page doesn't.

I saw three other problems that the check doesn't catch and left them alone to keep the change small:
- **Pricing (Vietnamese):** each plan name is cut off after one line (`.plan__name` has a fixed height and hides the rest), so "Gói Doanh nghiệp không giới hạn" is partly hidden.
- **Pricing (dark mode):** the page asks for `img/plans-dark.svg`, which doesn't exist, so the picture probably won't show.
- **Light mode:** the grey used for captions and table headers (`--text-muted` `#a1a1aa`) is hard to read on white.
