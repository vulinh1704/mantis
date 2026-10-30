I fixed the problems on phones and in dark mode. The UI checker (Mantis) now reports **17 errors and 5 warnings → 0 errors and 0 warnings**. It checked all 3 pages on phone, tablet and desktop widths, in light and dark mode, in English and Vietnamese. Nothing is committed.

**What was wrong and what I changed**

1. **Phone menu was broken** (`js/drawer.js`): the script looked for a button called `#drawer-toggle`, but the button is `#nav-toggle`. Every page threw a script error on phones and the menu button did nothing. The script now finds the right button. I also took out its check for phone width at page load, because the CSS already hides the button on wider screens. `.site-header` is now `position: relative` so the open menu sits under the header.
2. **Grey text was too faint in light mode** (`css/tokens.css`): `--text-muted` was `#a1a1aa`, which fails readability contrast on white. That one colour is used by the captions, the footer, "/month", the table headers and the profile labels. I changed it once to `#64748b`. Dark mode was already fine.
3. **Promo card stayed white in dark mode** (`css/components.css`): `.card--promo` had a hard-coded `#ffffff` background, so in dark mode its light text was nearly invisible on white. It now uses `var(--bg)`, so it follows the theme.
4. **Dark pricing image was missing**: `pricing.html` asks for `img/plans-dark.svg` in dark mode, but the file didn't exist and the image broke. I added it, using the dark theme colours.
5. **Pages scrolled sideways on phones**:
   - The filter buttons couldn't wrap, and the longer Vietnamese labels pushed them off screen. They now wrap onto a second line.
   - The invoice table is 741px wide. It now scrolls inside its own box on `account.html`, and the rest of the page stays still.
6. **Long plan name was cut off** (Vietnamese "Gói Doanh nghiệp không giới hạn"): `.plan__name` had a fixed one-line height with the overflow hidden. It's now a minimum height, so the name can wrap.
7. **Chat bubble covered the cookie "Accept" button** on phones and tablets. Below 900px wide the cookie bar now leaves space on the right for the bubble.
8. **Footer social icons were too small to tap** (18×18px). Each link is now 44×44px; the icons are the same size.
9. **Account page jumped while loading**: the profile card was pushed down when the invoices appeared. The table now has four empty placeholder rows in the HTML that hold the space until the invoices load.

**Checks**
- **Last Mantis run:** `21 fixed · 0 new · 0 cover-ups · 0 lost`. The first fix pass was `22 fixed · 0 new · 0 cover-ups · 0 lost`.
- **Undo test:** I set my changes aside and ran Mantis again, and 21 issues came back. When I put the changes back, all 21 were fixed again. The new image file wasn't part of that test because it's a new file rather than an edit.
- **Your phone test** (`npm run check:ui`): passes for all 3 pages × 2 languages at 360px wide.

On phones the Accept button sits close to the chat bubble but no longer under it. You can look at the screens yourself in `.mantis\latest\contact-sheet.png` in the project folder.
