`npm run check:ui` passes now. Nothing is committed; the changes are in the working tree.

**What was wrong (root causes)**
- **Script error on every page:** `js/drawer.js` looked up `#drawer-toggle`, but the markup's button is `#nav-toggle`. The null lookup threw on phones and broke the script.
- **Cookie button not clickable:** the fixed chat bubble sat on top of the cookie notice's Accept button (both bottom-right, bubble above in z-order).
- **Sideways scroll on Home (Vietnamese):** the filter row had `nowrap` buttons with no wrap, and the Vietnamese labels are longer.
- **Sideways scroll on Invoices:** the table had `nowrap` on every cell and no scroll container, so the long customer name forced it to about 740px.

**What I changed**
- `js/drawer.js`: id `#drawer-toggle` → `#nav-toggle`.
- `css/components.css`: `.filters` gets `flex-wrap: wrap`.
- `css/table.css`: new `.table-wrap { overflow-x: auto }`, and `.invoices .customer` may wrap.
- `account.html`: the table is wrapped in `<div class="table-wrap">`.
- `css/overlays.css`: below 900px, the chat bubble moves to `bottom: 88px` while the cookie notice is visible. The bar measured 72px at 360px in both languages.

**Error count before → after**
- Mantis: 15 errors, 4 warnings → 8 errors, 5 warnings.
- The check: 15 failures → 0.

**Comparison and revert-proof**
- Last run: `8 fixed · 1 new · 0 cover-ups · 0 lost`, against the baseline run `2026-10-29T19-13-57`.
- The revert-proof check passed. With my five files stashed, the 8 fixed issues came back as new. After `git stash pop`, the check passed again.
- The 1 new item is a `layout-shift` warning. The invoice rows are filled in by JavaScript after load, so the table grows and pushes `#profile` down about 270px. That shift was already in the baseline (`table.invoices` was flagged as a layout shift); the wrapper is now the element it's attributed to. I didn't fix it, since the fix is to render rows on the server or reserve a height, and that's more than this change.
- The project has no tests, type check or linter configured, so there was nothing else to run.

**Left alone (not in the check, outside the small-change scope)**
- Contrast: 6 errors from `--text-muted: #a1a1aa`, which fails 4.5:1 on light backgrounds. One token fix, but it changes the look of the whole app, so it's a design call.
- Tap targets: the social icons are 18px, below 24px.
- Theme leak: `.card--promo` hard-codes `--surface: #ffffff`, so its text is unreadable in dark mode.
- Broken image: `img/plans-dark.svg` returns 404, so the pricing art has no dark version.
- Layout shift on the invoice list, described above.

The Mantis report is at `.mantis/latest/report.md` (the `.mantis` folder is generated output). Two temporary measurement scripts are in the scratchpad folder, outside the repo.
