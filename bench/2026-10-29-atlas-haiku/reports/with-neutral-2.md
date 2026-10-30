I fixed the layout and dark-mode problems I could find in the source, but I could not run Mantis itself. The shell was blocked for part of the session, so there is no before/after report or revert-proof check.

**What was wrong and what changed**

- **Mobile menu never opened.** `js/drawer.js` looked for `#drawer-toggle`, but the button is `#nav-toggle`. The script threw an error and the menu did nothing. I fixed the selector. I also made the open menu position correctly by giving `.site-header` `position: relative`, and gave its links 44px tap height.
- **Filter buttons pushed the page sideways on phones.** The row did not wrap. Added `flex-wrap: wrap` to `.filters`.
- **Invoice table overflowed on phones.** I wrapped it in a `.table-wrap` with horizontal scroll inside the box, so the page itself no longer scrolls. Long customer names now wrap.
- **Plan names were cut off in Vietnamese.** `.plan__name` had a fixed height and `overflow: hidden`. I removed both, so the names wrap.
- **Promo card was unreadable in dark mode.** `.card--promo` hard-coded a white surface, so light text sat on white. I removed the override.
- **Dark-mode pricing image was broken.** `pricing.html` pointed to `img/plans-dark.svg`, which did not exist. I created it with a dark palette.
- **Muted text was too faint in light mode.** `--text-muted` was `#a1a1aa` on white, about 2.4:1. I changed it to `#475569` (about 7:1), in `css/tokens.css`.
- **The chat bubble covered the cookie notice's Accept button** on phones. I lowered its z-index below the notice.
- **Social icons were 18px tap targets.** They are now 44px.

**Verification**

- `npm run check:ui` passes: 3 pages × 2 languages at 360px.
- A short extra Playwright check at 360px covering light and dark, English and Vietnamese, found no console or page errors, no broken images, no clipped text, and a working drawer.
- I did not measure the "before" state, so I can't give exact before → after error counts.
- Nothing is committed.

**Not done**

- `mantis look`, the `.mantis/` baseline and its comparison, and the revert-proof step. The shell calls for these were refused, and I did not run them with `--baseline none` or by bypassing the check.
- The `/mantis` run still needs to happen on your side or once shell access is granted. It will show whether any other screen issues remain.
