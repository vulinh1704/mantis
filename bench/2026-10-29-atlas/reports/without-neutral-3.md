I've fixed the phone and dark-mode problems on all three pages. The project's phone check (`npm run check:ui`) went from 15 failures to passing in both English and Vietnamese. I also took 360px screenshots in light and dark mode, in both languages, and looked at them. Nothing is committed.

**Why it looked broken on phones**
- **The menu button did nothing and caused a script error on every page.** `js/drawer.js` looked for `#drawer-toggle`, but the button is `#nav-toggle`. I fixed the lookup. I also gave the header `position: relative; z-index: 30` so the opened menu shows above the page.
- **The cookie banner's Accept button couldn't be tapped.** The chat bubble sat on top of it. On screens narrower than 900px, the banner now has extra right padding so the button stays clear of the bubble (`css/overlays.css`).
- **The invoices page scrolled sideways (757–792px of content on a 360px screen).** The table now sits in its own scrollable box (`.table-scroll` in `account.html` and `css/table.css`), and the long customer names wrap.
- **The dashboard scrolled sideways in Vietnamese.** The longer filter labels ("Quá hạn thanh toán") didn't fit on one line; the filters now wrap onto a second line.
- **Plan names on the pricing page were cut off.** Names were limited to one line, which cut off "Unlimited Business" and "Gói Doanh nghiệp không giới hạn". I removed that limit.
- **The footer social icons were too small to tap.** Their tap area went from 18×18px to 44×44px; the icons look the same size.

**Dark mode**
- **The "Switch to annual billing" card was white with light text.** `.card--promo` hard-coded a white background. It now uses the normal card colour.
- **The pricing illustration was a broken image.** The page asks for `img/plans-dark.svg` in dark mode, but that file didn't exist. I created it as a dark-coloured copy of `plans.svg`.

**Light mode, while I was there**
- **Grey caption text was hard to read.** It had about 2.5:1 contrast against white, which fails accessibility guidelines. I changed it from `#a1a1aa` to `#64748b`, about 4.8:1. Dark mode's grey was already fine.

On a 360px phone, the Amount and Status columns of the invoice table are still off to the right, and you scroll the table sideways to see them. The page itself no longer scrolls sideways. If you'd rather show invoices as stacked cards on small screens, that would be a bigger layout change.

The screenshot script is at `%TEMP%\claude\mantis-bench-without-neutral-3-atlas\c59e33ea-b0eb-4127-aaf6-97d8a30cda09\scratchpad\shots.mjs`, and the screenshots are saved in the same folder.
