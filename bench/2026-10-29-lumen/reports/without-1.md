I fixed the problems I found on both pages, in `styles.css`, `index.html`, `app.js` and `settings.js`. Nothing is committed. I couldn't open a browser from this sandbox, and the request to check the running server was blocked. So I found these by reading the code and haven't seen them on screen. The only check I ran was that both JS files have no syntax errors. Please look through `/` and `/settings.html` at phone width, in dark mode and in Vietnamese.

**Phones**
- **Promo banner** had a fixed 600px width, which made the whole page scroll sideways on phones. It now shrinks to fit (`max-width: 600px`).
- **Menu button** was pinned over the "Start free" button on screens under 640px. The menu also never opened: it only added a `menu-open` class that no CSS used. I removed the pinning and built a dropdown menu. It includes "Log in", which was hidden on small screens with nowhere else to find it, and it closes when you tap a link.
- **"Most popular" badge** was moved on phones to sit over the Pro plan's button. It now stays in its normal top-right spot.
- **Hero image** loaded late with no size set, so it pushed the headline and buttons down after the page appeared. It now loads normally with its size set, and I removed the delayed-loading code in `app.js`.
- **Social icons** in the footer were 16×16px tap targets. They're now 44×44px.
- **Settings tabs** on mobile used the wrong edge offset between 640px and 767px, which put them out of line with the content. On phones, the Cancel/Save buttons now share the row.

**Dark mode**
- **Business plan card** was hard-coded white, so its light text nearly disappeared in dark mode. It now uses the theme colour like the other cards.
- **"Danger zone" title** was hard-coded dark red, which was barely visible on the dark background. It now uses the theme's danger colour.
- **Hero note** ("No credit card required") was `#aaa`, which is too low-contrast in light mode. It now uses the theme's muted grey.

**Vietnamese**
- **Top nav** cut off long labels like "Câu hỏi thường gặp" because of a 420px limit with hidden overflow. I removed the limit, and by my estimate the Vietnamese labels still fit on one line at 1024px.
- **Subscribe button** was fixed at 120px, which cut "Đăng ký nhận bản tin" short. It now sizes to its text.
- **Save button** on Settings was fixed at 84px, too narrow even for "Save changes". It now sizes to its text.

**Other things that broke the pages**
- **Testimonial photo** pointed to `/img/team.jpg`, which doesn't exist, so the image was broken. It now uses `/img/team.svg`.
- **Settings script** looked for `#save-btn`, which doesn't exist, so it threw an error on every load and the Save button did nothing. It now uses `#save-settings`.
- **Leftover one-off styles** at the end of `styles.css` set odd sizes (13.6px text, a 15px corner radius, a near-duplicate grey) that didn't match the rest of the site. I removed them.

One thing I left alone: the hero illustration is drawn in light colours, so it stays light in dark mode. It reads fine as a product screenshot, but you might want a dark version.
