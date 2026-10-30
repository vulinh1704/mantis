I fixed the phone and dark-mode problems on all three pages. The project's phone check (`npm run check:ui`) now passes for every page in English and Vietnamese; before, it failed on all six combinations. I also took screenshots of each page in light and dark mode, in both languages, at phone width (360px), and they look right. Nothing is committed.

**Phone problems**
- **The menu button didn't work, and every page had a script error.** `js/drawer.js` looked for a button called `#drawer-toggle`, which doesn't exist; the real one is `#nav-toggle`. The menu now opens. It also works if someone rotates the phone or resizes the window after the page loads.
- **The chat bubble covered the cookie notice's "Accept" button.** On narrow screens the bubble now moves up to sit just above the cookie bar, then drops back down once the bar is dismissed (`css/overlays.css`, `js/app.js`).
- **The dashboard scrolled sideways in Vietnamese.** The filter buttons were forced onto one line, and the longer Vietnamese labels didn't fit. They now wrap onto a second line (`css/components.css`).
- **The invoice table made the page about 790px wide.** The table now scrolls sideways inside its own box instead of the whole page, and long customer names wrap (`account.html`, `css/table.css`).
- **The longest plan name was cut off.** In Vietnamese, "Gói Doanh nghiệp không giới hạn" was clipped to one line. Plan names can now take two lines.
- **The footer social icons were tiny to tap (18px).** They now have 44px tap areas.

**Dark-mode problems**
- **The "Switch to annual billing" card was white with light text.** It hard-coded a white background, which made the text almost unreadable in dark mode. It now uses the normal card background.
- **The pricing image was broken.** The page asked for `img/plans-dark.svg`, which didn't exist. I created a dark version of the existing image.
- **Grey secondary text was too faint in light mode.** I darkened it from `#a1a1aa` (about 2.5:1 contrast on white) to `#64748b` (about 4.8:1), which meets the usual readability standard.

The changes are in `account.html`, `css/components.css`, `css/overlays.css`, `css/table.css`, `css/tokens.css`, `js/app.js` and `js/drawer.js`, plus the new `img/plans-dark.svg`.

The phone check only tests light mode. If you want CI to catch dark-mode regressions too, it could run each page a second time in dark mode.
