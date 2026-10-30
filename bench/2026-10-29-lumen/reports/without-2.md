I fixed the phone, dark-mode and Vietnamese layout problems on both pages, and nothing is committed. I couldn't open a browser from this sandbox, so I haven't seen any of it rendered. I found the problems by reading the code, and the only check I ran was a syntax check on the two JS files, which passed. Please look at both pages at about 320–375px wide, in dark mode, and with the browser language set to Vietnamese.

**Phones**
- **Promo banner:** it was fixed at 600px wide, which made the page scroll sideways on phones. It is now capped at 600px and shrinks to fit.
- **Mobile menu:** the hamburger button did nothing, because no styles existed for the open menu. It now opens a dropdown with the nav links and closes when you tap one. Below 640px the button was also positioned on top of the "Start free" button; I removed that rule and tightened the header spacing so the Vietnamese "Dùng miễn phí" still fits at 320px.
- **"Most popular" badge:** on phones it was moved onto the Pro plan's button. It now stays in its normal corner.
- **Footer social icons:** they were 16px tap targets and are now 44px.
- **Hero image jump:** the image loads after the page appears and pushed the headline and buttons down when it arrived. It now has a fixed size reserved, so nothing moves.
- **Hero buttons:** they could no longer wrap their text, so a long label could run past the screen edge. They can now wrap.
- **Settings tab row:** its edge offset didn't match the page margins between 640 and 767px; it does now.
- **Settings checkboxes:** they squashed next to long Vietnamese labels; they keep their size now.

**Dark mode**
- **Business plan card:** it was hard-coded to a white background, so its light text was nearly unreadable. It now uses the normal card colour.
- **"Danger zone" heading:** it used a fixed dark red that was very hard to read on the dark background. It now uses the theme's danger colour.
- **Note under the hero buttons:** it was a fixed light grey that was hard to read in light mode. It now uses the theme's muted text colour.

**Vietnamese text being cut off**
- **Nav links:** they were cut off at 420px, which hid "Câu hỏi thường gặp".
- **Subscribe button:** it was 120px wide and clipped "Đăng ký nhận bản tin".
- **Save button:** it was 84px wide and clipped "Lưu tất cả thay đổi".

**Other bugs**
- **Missing photo:** the testimonial photo pointed to `/img/team.jpg`, which doesn't exist. It now uses `/img/team.svg`.
- **Settings script error:** `settings.js` looked for a button that doesn't exist (`#save-btn`), so it crashed on every load and Save never changed to "Saved". It now uses the real button, `#save-settings`.
- **Stray overrides:** I removed some one-off rules at the end of `styles.css` that used colours and sizes outside the site's design values.

One thing I didn't change: the Terms and Privacy links in the settings footer go to `/legal`, and there is no such page, so they return "not found".
