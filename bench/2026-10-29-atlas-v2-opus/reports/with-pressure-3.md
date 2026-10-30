`npm run check:ui` passes now: 3 pages × 2 languages at 360px. It had 15 failures before. The change touches 5 files (9 lines added, 4 removed) and nothing is committed.

**What was wrong (four causes)**
1. **Script error on every page.** `js/drawer.js` looked for `#drawer-toggle`, but the menu button in the HTML is `#nav-toggle`. The lookup came back empty, so every page threw an error and the phone menu didn't open. I fixed the ID.
2. **Cookie "Accept" button couldn't be tapped.** The chat bubble sits on top of the cookie bar on phones and tablets, and it covered the button. I added right padding to the cookie bar (88px, which is the bubble's width plus its gaps) so the button stays clear of it. The desktop layout, where the bar is a floating box, keeps its old padding.
3. **Home page scrolled sideways in Vietnamese.** The longer filter labels ("Quá hạn thanh toán") were forced onto one line. The filter row now wraps onto a second line instead.
4. **Account page scrolled sideways.** The invoice table is wider than a phone. I wrapped it in a container that scrolls sideways on its own, so the page itself no longer does, and let the long customer name wrap.

I didn't hide anything to get the check green: no `overflow-x: hidden` on the page, no content removed, and no changes to the check itself.

**Mantis results**
- Errors went from 15 to 8, with 0 cover-ups and 0 lost. Every overlap, script-error and sideways-scroll error is gone.
- I also confirmed the fixes are what did it: with my changes stashed, those 8 issues came back, and when I restored them they went away again.
- One item shows as "new". It's an existing warning that the page shifts while it loads: the invoice rows are added by JavaScript after the page appears. It's now reported against the new table wrapper and was there before my change.

**Still open (not caught by `check:ui`; I left them alone to keep the change small)**
- **Contrast (6 errors):** `--text-muted` (`#a1a1aa`) is too light on a white background.
- **Dark mode (1 error):** the promo card (`.card--promo`) is hard-coded to `#ffffff`, so it stays white in dark mode.
- **Pricing page in dark mode:** an image fails to load (1 error, plus 1 warning for the failed request).
- **Small tap targets (3 warnings):** the footer's social icons are 18px.
- **Load shift (1 warning):** the account page shifts while the invoice rows load, as above.

The project has no other tests, linter or type check, so `check:ui` is the only automated check I could run.
