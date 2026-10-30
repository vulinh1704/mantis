I've fixed the phone, dark-mode and Vietnamese problems in this checkout; nothing is committed. Your server on port 4351 isn't running from this folder: its CSS, `index.html` and `settings.js` differ from the files here and already contain fixes for most of these bugs. So a check against 4351 tested a different copy of the site. You'll need to restart it from this folder (`npm run dev`) to see these changes there.

**What was broken and what I changed**

| Problem | Where | Fix |
|---|---|---|
| Page scrolls sideways on phones | `.promo` had `width: 600px` | Changed to `max-width: 600px` |
| Menu button sat on top of "Start free" on phones | `.menu-toggle` was absolutely positioned under 640px | Removed that rule; it now sits in the header row |
| "Most popular" badge covered the Pro button on phones | mobile `.badge` override | Removed it |
| Vietnamese nav links cut off on desktop | `.nav-links` had `max-width: 420px; overflow: hidden` | Links now wrap instead of being clipped |
| Vietnamese buttons cut off ("Đăng ký nhận bản tin", "Lưu tất cả thay đổi") | fixed widths on `#newsletter-submit` and `#save-settings` | Changed to `min-width` for the first, removed the width on the second |
| White Business price card in dark mode | `#plan-business { background: #fff }` | Removed |
| "Danger zone" title unreadable in dark mode | hard-coded `#7f1d1d` | Uses `var(--danger-ink)` |
| Hero note text too faint | `color: #aaa` | Uses `var(--muted)` |
| Content jumped down when the hero image loaded | `<img>` had no size | Added `width`/`height` and an `aspect-ratio` |
| Broken testimonial photo | `team.jpg` doesn't exist | Points to `team.svg` |
| JavaScript error on every settings page load | `settings.js` looked for `#save-btn`, which doesn't exist | Uses `#save-settings`, the button's real ID |
| Social icons too small to tap | 16px links | 40px tap area; the icons stay 16px |
| Stray almost-matching values (`#465569`, `13.6px`, `15px` radius) | end of `styles.css` | Removed |

I also rewrote a half-finished comment in `app.js`.

**How I checked**

- I served this folder on a temporary port (4352) and ran Mantis on both pages: 3 screen sizes × light/dark × English/Vietnamese, 24 views in all. It reported 0 errors.
- Mantis also reported 0 errors on the other copy at 4351, which still had several of these bugs. So I don't count its clean result as proof. I looked at the screenshots myself: settings on a phone in dark mode and the home page on desktop in dark mode, both in Vietnamese, look right. I didn't open each of the 24 views one by one.
- Mantis doesn't click anything, so I didn't check the open mobile menu, hover or focus states, or the "Saved" text after the button is clicked.

The temporary server is stopped.
