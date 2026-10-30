I fixed the phone and dark-mode problems. All 3 pages now pass at phone (360px), tablet (768px) and desktop (1440px) widths, in light and dark mode, in English and Vietnamese. That's 36 combinations, and the errors went from 17 errors and 6 warnings to none. Nothing is committed.

**What was wrong and what I changed:**

1. **Menu button did nothing on phones, plus a script error on every page.** `js/drawer.js` looked for `#drawer-toggle`, but the button in the HTML is `#nav-toggle`. I fixed the name.
2. **The promo card stayed white in dark mode, so its text was almost invisible.** `.card--promo` forced a white background. I removed that so it uses the theme colours like the other cards.
3. **Grey text was hard to read in light mode** (captions, footer, table headings, "/month", profile labels). I darkened the one shared colour, `--text-muted` in `css/tokens.css`, from `#a1a1aa` to `#64748b`. This is a new colour value, not one the app already used. Dark mode is unchanged.
4. **The dark-mode pricing picture was missing.** `pricing.html` asks for `img/plans-dark.svg`, which didn't exist. I made one from the light picture, recoloured with the app's dark palette. It's a new file, so please check it looks right to you.
5. **Pages scrolled sideways on phones:**
   - The Vietnamese filter buttons are longer and couldn't wrap. They now wrap onto a second line.
   - The invoice table is now in its own scrollable box (`account.html`, `css/table.css`) instead of widening the whole page, and long customer names wrap.
6. **"Gói Doanh nghiệp không giới hạn" was cut off.** The plan name had a fixed height of one line. I removed it so the name can wrap.
7. **The chat button covered the cookie notice's Accept button** on phones and tablets. The notice now leaves space on the right for it (`css/overlays.css`).
8. **The footer social icons were too small to tap** (18×18px). They are now 44×44px; the icons stay the same size.
9. **The account page jumped while loading.** The invoice rows are added by script after the page first appears, which pushed everything below down. The table area now reserves about the height of a header plus four rows. This is a fixed guess: with many more invoices there will still be a small jump.

**Checks:**
- **Revert test:** with my changes removed, 22 issues came back. With them restored, all 22 were fixed.
- **Cover-ups:** none. Nothing was hidden or removed to make an issue go away.
- **Your phone test:** `npm run check:ui` passes.

**Not checked:** the automated check doesn't click or hover. I didn't open the mobile menu in a browser to see how it looks once open, and I didn't test the hover states.

The overview image of every screen is at `.mantis/latest/contact-sheet.png`.
