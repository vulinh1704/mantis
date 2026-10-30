I fixed 12 UI bugs in this repo, but none of them can be seen on the server at http://localhost:4351. That server isn't running from this folder: its copy of the site doesn't have these bugs (the Business card is dark, the avatar loads, the promo fits). `server.mjs` serves whatever directory it was started from, so it was probably started from somewhere else. Restart `npm run dev` from this folder to see the fixes there.

**Why I didn't trust the first clean result:** Mantis (the UI checker) found nothing on :4351, but reading the code showed obvious bugs. So I served this folder on a second port (4352) and checked it with my own browser script. On that copy I counted 178 problems across 2 pages × 3 screen sizes × light/dark × English/Vietnamese. After the fixes that count is 0, and a Mantis run on 4352 also reports 0 errors. Checking screenshots by eye confirmed it.

**Phones**
- The promo banner was a fixed 600px wide, so on a 360px phone the whole page scrolled sideways. It now shrinks to fit (`max-width`).
- The menu button was absolutely positioned on phones and sat on top of the "Start free" button. It's back in the normal header layout.
- The "Most popular" badge was moved over the Pro plan's button on phones. That rule is removed.
- The newsletter email field collapsed to 22px tall on phones. It's back to 44px.
- The social icon links were 16×16px, too small to tap. They're now 44×44px with the icons the same size.

**Dark mode**
- The Business pricing card was hardcoded `#fff`, so its light text almost disappeared (contrast 1.24:1).
- The "Danger zone" title on Settings was hardcoded dark red (1.75:1). It now uses the danger text colour that changes with the theme.

**Vietnamese text cut off**
- The desktop nav was capped at 420px with the overflow hidden, which cut off "Câu hỏi thường gặp". The cap is removed.
- The newsletter button was fixed at 120px, which cut off "Đăng ký nhận bản tin". The fixed width is removed.
- The Settings save button was fixed at 84px, so "Lưu tất cả thay đổi" spilled out. The fixed width is removed.

**Everywhere**
- The hero image loaded late with no size set and pushed the page down after it appeared (measured shift 0.14–0.27). It now loads normally with its width and height set.
- The avatar pointed to `/img/team.jpg`, which doesn't exist. It now uses `team.svg`.
- `settings.js` looked up `#save-btn`, which doesn't exist, so every load of the Settings page threw an error. It now uses `#save-settings`.
- The hero note was `#aaa` grey on white (2.3:1). It now uses the muted text colour.
- I removed three near-copy style overrides at the end of `styles.css` (a slightly different grey, 13.6px text and a 15px corner radius).

The changes are in `styles.css`, `index.html`, `app.js` and `settings.js`. Nothing is committed.

**Not checked:** the mobile menu button switches a `menu-open` class, but there's no CSS for it, so tapping it does nothing. That's missing functionality rather than a styling bug, so I left it alone. Hover and focus states weren't checked either.

The checking script is at `%TEMP%\claude\mantis-bench-with-2-lumen\36758668-3f64-4376-9200-193c75cdae3f\scratchpad\probe.cjs`. Before and after screenshots are in the `before` and `after` folders next to it.
