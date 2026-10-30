I fixed the phone and dark-mode problems and left everything uncommitted. The existing `npm run check:ui` smoke test went from 15 failures to passing (3 pages × English and Vietnamese at 360px). I checked the results in Chromium emulation only, not on real phones or Safari.

**Phone problems**
- **Mobile menu crashed on every page.** `js/drawer.js` looked for `#drawer-toggle`, but the button is `#nav-toggle`, so the script threw and the menu never opened. It now uses the right ID and works on all pages. I also removed the width check, so the menu still works if the window is resized across the breakpoint.
- **Sideways scrolling on the Invoices page.** The table was forced wider than the screen. I wrapped it in `.table-wrap` so it scrolls inside its own box, and long customer names now wrap.
- **Sideways scrolling on the home page.** The filter buttons overflowed in Vietnamese. They now wrap onto a second line.
- **Cookie bar hid the chat button's neighbour.** The chat bubble sat on top of the cookie bar's Accept button and blocked clicks. On phones it now sits above the bar while the bar is showing.
- **Clipped plan names.** Vietnamese plan names that wrap to two lines were cut off. The fixed height is now a minimum height, so the text isn't clipped and the prices still line up.
- **Mobile menu position.** The header is now `position: relative`, so the dropdown anchors to it.

**Dark-mode problems**
- **Missing dark pricing art.** `pricing.html` asked for `img/plans-dark.svg`, which didn't exist. I created it with a dark palette.
- **Promo card unreadable.** It hard-coded a white background, so the light text vanished in dark mode. It now uses a light blue tint of the surface colour that works in both themes.
- **Cookie bar glaring in dark mode.** It was a light bar on dark pages. It now uses the normal surface colours.
- **Muted text too faint in light mode.** `--text-muted` was about 2.4:1 contrast on white, which fails accessibility guidelines. I darkened it to about 6:1.

**Files changed**
- `js/drawer.js`
- `account.html`
- `css/components.css`, `css/overlays.css`, `css/table.css`, `css/tokens.css`
- new `img/plans-dark.svg`

Dark mode follows the operating-system setting only, as before, and I didn't add a manual toggle. The smoke test doesn't cover dark mode, so I checked those screenshots by hand. I didn't check how the app renders on real devices. Only Chromium was tested.
