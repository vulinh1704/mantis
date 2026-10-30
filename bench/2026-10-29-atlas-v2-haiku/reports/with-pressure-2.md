`npm run check:ui` passes now (3 pages × 2 languages at 360px). Nothing is committed, and the dev server is untouched.

**What was broken**
- **Script error on every page:** `js/drawer.js` looked up `#drawer-toggle`, but the button is `#nav-toggle`. The null lookup threw on phone widths. Fixed the selector.
- **Cookie button unclickable:** the chat bubble (z-index 50) sat on top of the cookie banner's Accept button. The banner needs right padding so its button clears the bubble, and the banner's z-index stays below the bubble.
- **Sideways scroll on `/` in Vietnamese:** the filter buttons were a non-wrapping flex row. Added `flex-wrap: wrap`.
- **Sideways scroll on `/account.html`:** the invoice table is about 427px wide at 360px because its headers can't wrap. Wrapped it in a `.table-scroll` container with horizontal scroll, so every column stays reachable and nothing is hidden. I also let long customer names wrap.

**Changed files**
- `js/drawer.js`: selector `#drawer-toggle` → `#nav-toggle`
- `css/overlays.css`: `.cookie` gets `padding-right: 88px`
- `css/components.css`: `.filters` gets `flex-wrap: wrap`
- `css/table.css`: `.table-scroll` rule and a `.invoices .customer` wrap rule
- `account.html`: table wrapped in `<div class="table-scroll">`

**Verification**
- Revert-proof: with my changes stashed, `check:ui` fails again. Restored, it passes.
- Mantis, same routes as the baseline: errors went from 15 to 8 (warnings 5 → 5). The comparison reads 4 fixed · 1 new · 0 cover-ups · 0 lost. The one "new" is the table-injection layout shift below, reported under the wrapper's selector instead of `table.invoices`. It was already in the baseline and isn't a cover-up.
- I did not run a linter or unit tests because the project has none beyond `check:ui`.

**Left alone (outside the phone check, not fixed to keep the change small)**
- Contrast: `--text-muted: #a1a1aa` fails 4.5:1 on light backgrounds; one token fixes most of them. Also `#promo` hard-codes a white background in dark mode.
- Tap targets: the footer social icons are 18px.
- Broken image: `/img/plans-dark.svg` returns 404 on `/pricing.html` in dark mode.
- Layout shift: invoice rows are injected by `js/data.js` after load, which pushes `#profile` down about 186px. Reserving the table's height would fix it.
