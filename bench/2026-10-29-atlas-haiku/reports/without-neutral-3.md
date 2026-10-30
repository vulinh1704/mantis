I fixed the phone and dark-mode problems in Atlas. The phone check (`npm run check:ui`) now passes for all 3 pages in English and Vietnamese at 360px. It was failing 15 checks before. Nothing is committed.

What was broken and what I changed:

- **Mobile menu did nothing.** `js/drawer.js` looked for `#drawer-toggle`, but the button is `#nav-toggle`. The script threw an error and the menu never opened. It now uses the right button and works, and the menu sits directly under the header.
- **Sideways scroll on Vietnamese pages.** The filter buttons didn't wrap, so they pushed the page wider than the phone screen. They now wrap. The invoice table sits in a scrollable wrapper (`account.html`, `css/table.css`), so the page stays within the screen. On a phone you scroll the table itself to see the Status column.
- **Cookie Accept button covered by the chat bubble.** On phones the bubble now sits above the cookie bar (`css/overlays.css`).
- **Dark mode: promo card text invisible.** The card was forced to a white background while the text stayed light. It now uses a theme token (`--promo-bg`): white in light mode, deep blue in dark mode (`css/tokens.css`, `css/components.css`).
- **Dark mode: pricing image broken.** The page asked for `img/plans-dark.svg`, which didn't exist. I created it with the same layout in dark colours.
- **Light mode: grey text hard to read.** The muted caption colour was `#a1a1aa` on white, about 2.4:1 contrast. It's now `#64748b`, which is about 4.8:1.
- **Vietnamese plan names clipped.** "Gói Doanh nghiệp không giới hạn" wrapped to two lines and the second was cut off. The name box now grows to fit two lines.

I checked the result with screenshots at 360px in dark mode (dashboard, pricing), light mode (invoices, Vietnamese) and with the menu open. I did not check desktop widths after the change.

Things I left alone:
- The page `<title>` is still English in Vietnamese mode.
- The menu button's label still says "Open menu" while the menu is open.
- Dark mode follows the device setting only; there is no in-app toggle.
