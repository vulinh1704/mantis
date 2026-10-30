I fixed the phone and dark-mode problems on both pages. A re-check found no overflow and no console errors in English or Vietnamese, light or dark, at widths of 320, 390, 1024 and 1280. Nothing is committed.

**Your dev server on :4351 isn't serving this repo.** Its copies of `styles.css`, `index.html` and `settings.js` differ from the files here, and it uses `team.svg` where the repo has `team.jpg`. It must have been started from another folder. So I tested this repo on a temporary server on :4352, which I've stopped. Restart `npm run dev` from this folder to see the fixes on :4351.

**Phones**
- **Page wider than the screen:** the promo bar had a fixed width of 600px. It's now `max-width: 600px`.
- **Header:** on screens under 640px the menu button was positioned on top of the "Start free" button. It now sits in the normal row with tighter spacing.
- **Menu button did nothing:** it set a `menu-open` class that no style used. It now opens a dropdown with the nav links, and tapping a link closes it (`app.js`).
- **"Most popular" badge:** on phones it was moved down over the Pro plan's sign-up button. It now stays at the top of the card.
- **Social icons:** the links were 16×16px, too small to tap. They're now 40×40px.
- **Settings checkboxes:** a checkbox shrank when its label wrapped. They now keep their size.

**Vietnamese text being cut off**
- **Top nav:** the links were capped at 420px with overflow hidden, which cut off "Câu hỏi thường gặp".
- **Subscribe button:** it was fixed at 120px with overflow hidden, which cut off "Đăng ký nhận bản tin".
- **"Save changes" button in Settings:** it was fixed at 84px, so "Lưu tất cả thay đổi" wrapped onto four lines.

**Dark mode**
- **Business pricing card:** it had a hardcoded white background, so its light text was almost invisible. It now uses the theme's card colour.
- **"Danger zone" heading:** it was hardcoded dark red (`#7f1d1d`), which was unreadable on a dark background. It now uses the theme's danger colour.
- **Note under the hero buttons:** it was hardcoded `#aaa`, which is too faint on white. It now uses the theme's muted text colour.

**Other bugs I came across**
- **Hero image:** it loads after the page appears and pushed all the content down when it did. Giving it a width and height reserves its space up front.
- **Testimonial photo:** it pointed to `img/team.jpg`, which doesn't exist (404). It now uses `img/team.svg`.
- **Settings page error:** `settings.js` looked for a `#save-btn` element that doesn't exist, which threw an error on every load. It now uses `#save-settings`.
- **Stray overrides:** I removed some leftover rules at the end of `styles.css` that overrode the design values (a 13.6px font size, a 15px corner radius and a near-duplicate grey).

The changes are in `styles.css`, `index.html`, `app.js` and `settings.js`. One thing I didn't change: the Settings footer links to `/legal`, and that page doesn't exist in the repo.
