I fixed the mobile and dark-mode problems I could find in the source, and nothing is committed. I could not run Mantis itself: the shell asked for approval on every `mantis` call, so there is no `.mantis/` baseline and no before/after error counts from it. The checks below are my own scratch runs against the live dev server.

**What was wrong and what changed**

- **Mobile menu never opened.** `js/drawer.js` looked for `#drawer-toggle`, but the button is `#nav-toggle`, so the handler threw on phones. Fixed the selector. The header also needed `position: relative` so the dropdown anchors under it (`css/components.css`).
- **Dark-mode image missing.** `pricing.html` uses `img/plans-dark.svg` in dark mode, which didn't exist. I added it, in the same layout with a dark palette.
- **Promo card leaked the light theme.** `.card--promo` hard-coded a white surface. It now uses the theme surface and keeps its brand border.
- **Muted text too faint in light mode.** `--text-muted` was `#a1a1aa` on white, about 2.4:1. I changed the light value to `#52525b` in `css/tokens.css`. Dark mode is unchanged.
- **Filter pills overflowed on phones.** `.filters` now wraps (`css/components.css`).
- **Invoice table overflowed.** I wrapped it in `.table-wrap` with horizontal scroll (`account.html`, `css/table.css`), and let the customer name wrap instead of forcing one long line.
- **Vietnamese plan name clipped.** `.plan__name` had a fixed `1.4em` height with `overflow: hidden`. I removed both. The longest name now renders at its full 56px height.
- **Chat bubble covered the cookie Accept button on phones.** On narrow screens, when the cookie banner is visible, the bubble now sits higher (`css/overlays.css`). The 112px offset is an estimate. I did not measure the banner height, so please check it on a real phone.
- **Footer social icons were 18px tap targets.** The hit area is now 32px, with the icon size unchanged.

**Verification**

- `npm run check:ui` passes: 3 pages × 2 languages at 360px, no script errors, no sideways scroll, cookie button clickable.
- A scratch Playwright run confirmed: the drawer opens and shows the nav links, the Vietnamese plan names are no longer clipped, the dark promo card is `rgb(17, 24, 39)`, and no requests fail in dark mode on the home and pricing pages.
- Not done: the revert-proof stash check and Mantis's own report, both because of the approval blocks. The project check and scratch run don't cover contrast, every route's dark mode, or the chat/cookie overlap on real screen sizes.

**Still open**

- Run `mantis learn` on the unchanged app, then `mantis look` with `--locales en,vi` and `--dark-strategy` set to how the app switches themes. The app only follows the OS setting (`color-scheme: light dark`), so the default strategy applies. I'd run this next and fix anything it reports.
- The `img/plans.svg` light panel is an image, not a theme token, so I left it as is.
