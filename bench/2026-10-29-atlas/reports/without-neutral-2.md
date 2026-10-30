I fixed the phone and dark-mode problems on all three pages, and `npm run check:ui` now passes. Before the fix it failed 15 times, on every page in both languages. Nothing is committed.

I also took screenshots of every page in light and dark mode, in English and Vietnamese, at 360px, 700px and 1200px wide. None of them showed sideways scrolling, cut-off text, script errors or missing files.

**Phones**
1. **Broken menu, script error on every page:** `js/drawer.js` looked for `#drawer-toggle`, but the menu button is `#nav-toggle`. The menu button did nothing and the page threw an error. I corrected the selector and removed the check that only ran once at load, so the menu still works after rotating the phone. I also made the header the reference point for positioning, so the opened menu sits right under it.
2. **Cookie "Accept" button couldn't be tapped:** the chat bubble sat on top of it. Below 900px the cookie bar now leaves space on the right for the bubble (`css/overlays.css`).
3. **Sideways scrolling on the dashboard in Vietnamese:** the filter buttons ("Quá hạn thanh toán"…) couldn't wrap onto a second line. Now they can.
4. **Sideways scrolling on the account page:** the invoice table didn't fit. Long customer names now wrap, and the table scrolls inside its own box instead of the whole page (`account.html`, `css/table.css`).
5. **Plan names cut off:** plan names had a fixed one-line height, so "Gói Doanh nghiệp không giới hạn" lost its second line. I removed the fixed height.
6. **Social icons too small to tap:** the footer icons were 18×18px. They're now 44×44px.

**Dark mode**
7. **Unreadable promo card:** the "Switch to annual billing" card forced a white background, so the light dark-mode text sat on white. It now uses the normal card colour.
8. **Broken image on the pricing page:** the page asked for `img/plans-dark.svg`, which didn't exist. I created a dark version of the illustration.

**Light mode**
9. **Grey text too faint:** captions, table headers and profile labels used `#a1a1aa`, which is too light to read easily on white. I changed it to `#64748b`, which meets the standard contrast level.

**Not fixed:** the pricing illustration's alt text and the "Sent / Reminded / Paid" labels inside the SVG are still English only. Say if you want those translated too.

My screenshot script is at `%TEMP%\claude\mantis-bench-without-neutral-2-atlas\2e001455-7462-4fdf-88be-c674a7dbaaf6\scratchpad\shots.mjs`. It's worth adding to CI, because `check:ui` never tests dark mode, so it couldn't have caught items 7–8.
