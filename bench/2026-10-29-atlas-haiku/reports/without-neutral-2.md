I fixed the phone and dark-mode problems in Atlas. `npm run check:ui` now passes all 15 checks it was failing (3 pages × 2 languages at 360px). Nothing is committed.

**Phone fixes**
- **Menu didn't open.** `js/drawer.js` looked for `#drawer-toggle`, but the button is `#nav-toggle`. That also threw a script error on every page. I also made the header `position: relative` so the open menu sits under the header.
- **Cookie notice button was covered by the chat bubble.** On phones the bubble now sits above the notice while it's showing (`css/overlays.css`).
- **Page scrolled sideways on the invoices page.** The invoice table is now inside a horizontally scrollable wrapper in `account.html`, and long customer names wrap.
- **Filter buttons ran off the screen.** The filter row now wraps (`css/components.css`).
- **Vietnamese plan names were clipped.** The "Gói Doanh nghiệp không giới hạn" name was cut off by a fixed height. It now reserves two lines.
- **Social icons were hard to tap.** Their touch target is now 44px.

**Dark-mode fixes**
- **Promo card had unreadable text.** It hard-coded a white background, so light text sat on white. It now uses a light tint of the brand colour.
- **Pricing illustration was broken.** `pricing.html` pointed to `img/plans-dark.svg`, which didn't exist. I created it as a dark version of the same art.

**Also changed**
- Light-mode muted text (`--text-muted`) was about 2.4:1 contrast on white. I darkened it to about 5.5:1.
- Heading line height went from 1.15 to 1.2 so Vietnamese tone marks don't collide with the line above.

I checked the dark-mode pages and the open menu with screenshots at 360px in Vietnamese. I didn't review light mode or the English pages visually beyond the smoke test.

The scratch screenshot script is in the scratchpad, outside the project.
