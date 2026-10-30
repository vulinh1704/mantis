I fixed the phone and dark-mode problems, and both pages now check clean in English and Vietnamese, light and dark. Nothing is committed.

I checked with Mantis, a tool that opens the site in a real browser: 2 pages × 3 screen sizes (phone 360px, tablet 768px, desktop 1440px) × light and dark × English and Vietnamese, 24 views in all. It went from **14 errors and 4 warnings to 0 and 0**, with nothing hidden to make the numbers go down. I also took my changes out and ran it again: all 18 problems came back, so these edits are what fixed them.

**Why it looked broken on phones**
- **Banner at the top:** it was a fixed 600px wide, so the whole page scrolled sideways on a phone. It now has a maximum width of 600px and shrinks to fit.
- **Menu button:** on phones it was pinned on top of the "Start free" button, so a tap could hit either one. It now sits in the header row next to it.
- **"Most popular" badge:** on phones it was moved down over the Pro plan's "Start 14-day free trial" button. I removed that phone-only rule, so it stays at the card's top corner.
- **Social icons in the footer:** they were 16×16px, too small to tap reliably. They're now 32×32px.

**Why it looked broken in dark mode**
- **Business pricing card:** its background was hard-coded white, so in dark mode its light text almost disappeared. It now uses the same card color as the other plans.
- **"Danger zone" title on Settings:** its dark red was hard-coded and was nearly unreadable on the dark background. It now uses the site's danger color, which switches with the theme.
- **"No credit card required" line:** the grey was too faint on white. It now uses the site's standard muted text color.

**Vietnamese text being cut off**
- **Top menu:** it cut off at a fixed width, so "Câu hỏi thường gặp" (FAQ) was clipped on desktop. The links can now wrap if they need to.
- **Newsletter button:** it was a fixed 120px and cut off "Đăng ký nhận bản tin". It can now grow to fit.
- **"Lưu tất cả thay đổi" (Save) on Settings:** it was squeezed to 84px and wrapped onto four lines. I removed the fixed width.

**Other bugs**
- **Settings page script:** it looked for a Save button by the wrong name, so it threw an error on every load and the button never showed "Saved". It now uses the button's actual name (`#save-settings`) in `settings.js`.
- **Testimonial photo:** it pointed to `/img/team.jpg`, which doesn't exist. It now uses `/img/team.svg`, which does.
- **Page jumping on load:** the hero image loads late and pushed the headline down. Its size is now reserved in advance, so the page doesn't move.
- **Leftover style overrides:** I removed a few at the end of `styles.css` that were near-copies of the site's own colors, sizes and corner rounding.

The changes are in `styles.css`, `index.html` and `settings.js`. A one-page screenshot overview of all 24 views is at `.mantis\latest\contact-sheet.png`.

Not checked: the open mobile menu, hover and focus states, and anything beyond these two pages. The project has no tests or linter to run.
