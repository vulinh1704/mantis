I fixed all of the problems on all three pages, in English and Vietnamese, at phone, tablet and desktop widths, in light and dark mode. Mantis, the UI checker set up in this repo, went from **17 errors and 5 warnings to 0 and 0**. Its comparison with the previous run shows `22 fixed · 0 new · 0 cover-ups · 0 lost`, so nothing was fixed by hiding or removing it. The project's own phone test (`npm run check:ui`) passes. Nothing is committed.

**What was wrong, and the fix:**

1. **Grey text was too faint in light mode.** The shared grey text color `#a1a1aa` read at about 2.5:1 against the background, below the 4.5:1 minimum. It affected captions, the footer, "/month", table headers and profile labels. I changed that one color in `css/tokens.css` to `#64748b`. Dark mode already used a lighter grey that reads fine.
2. **The promo card stayed white in dark mode.** `.card--promo` had a hard-coded white background, so its light-colored text nearly disappeared on dark screens. It now follows the theme background (`var(--bg)`).
3. **The dark pricing image was missing.** `pricing.html` asks for `img/plans-dark.svg` in dark mode, but the file didn't exist (404). I added a dark version using the app's dark colors.
4. **The phone menu button did nothing and threw a script error.** `drawer.js` looked for `#drawer-toggle`, but the button's id is `#nav-toggle`. It also only set up the button if the page first loaded at phone width. Both are fixed, and the header now anchors the drop-down menu.
5. **Pages scrolled sideways on phones.** Two causes:
   - The filter buttons couldn't wrap, which broke the home page in Vietnamese. They now wrap onto a second line.
   - The invoice table is about 740px wide. It now scrolls inside its own box, so the rest of the page stays put.
6. **The chat bubble covered the cookie notice's Accept button** on phones and tablets. While the notice spans the screen (below 900px), it now leaves room on the right for the bubble.
7. **The Vietnamese name of the third pricing plan was cut off.** "Gói Doanh nghiệp không giới hạn" was locked to one line. The title can now wrap.
8. **Social icons in the footer were too small to tap** (18px). The tap area is now 44px; the icons stay the same size.
9. **The invoices page jumped while loading.** The table started empty and filled in afterwards, pushing the Profile section down. Four placeholder rows now hold the space until the invoices load.

**Checks:**
- **Undo test:** I temporarily removed all the changes, re-ran Mantis and all 22 issues came back. With the changes restored they were fixed again.
- **Not checked by the tools:** Mantis doesn't click anything, so the opened phone menu wasn't tested in a browser. The code fix for it is straightforward.
- **The placeholder rows:** there are four because the sample data has four invoices. With a real data source they only need to roughly match a typical page of results.

The changed files are `css/tokens.css`, `css/components.css`, `css/overlays.css`, `css/table.css`, `js/drawer.js` and `account.html`, plus the new `img/plans-dark.svg`. Before/after screenshots are in `.mantis/runs/`, which git ignores.
