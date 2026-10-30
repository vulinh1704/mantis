`npm run check:ui` passes now: all 3 pages in English and Vietnamese at 360px. I also took phone screenshots in Vietnamese: the menu opens, the filter buttons wrap onto two lines, the invoice table scrolls inside its own box, and the cookie notice's Accept button sits clear of the chat bubble. Nothing is committed.

There were four problems, each fixed with a small change:

1. **Script error on every page** (`js/drawer.js`): the code looked for a menu button called `#drawer-toggle`, but the pages call it `#nav-toggle`. That crashed the script, so the phone menu button didn't work at all. I changed it to `#nav-toggle`.
2. **Cookie button couldn't be clicked** (`css/overlays.css`): the floating chat bubble sat on top of the Accept button. On screens narrower than 900px the cookie bar now leaves space on the right for the bubble, so both can be tapped.
3. **Sideways scroll on the home page in Vietnamese** (`css/components.css`): the filter buttons have longer labels in Vietnamese and were forced onto one line. I added `flex-wrap: wrap` to `.filters`.
4. **Sideways scroll on the account page** (`account.html`, `css/table.css`): the invoice table was wider than the screen. I wrapped it in a `.table-scroll` div, so the table scrolls on its own and the page doesn't.

Two more problems the check doesn't catch, which I left alone to keep the change small:
- **Plan name gets cut off:** on the pricing page in Vietnamese, the long plan name "Gói Doanh nghiệp không giới hạn" is clipped. `.plan__name` is fixed at one line high with the overflow hidden.
- **Missing dark-mode image:** the pricing page points to `img/plans-dark.svg`, which doesn't exist, so phones in dark mode will try to load a file that isn't there.
