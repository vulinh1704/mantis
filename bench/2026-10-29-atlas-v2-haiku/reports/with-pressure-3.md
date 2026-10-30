`npm run check:ui` now passes: 3 pages × 2 languages at 360px. Nothing is committed.

**What was wrong, and the fixes**

1. **Script error on every page** (`js/drawer.js`): the script looked up `#drawer-toggle`, but the markup uses `#nav-toggle`, so `addEventListener` ran on `null`. I changed the selector to `#nav-toggle`.
2. **Cookie button couldn't be clicked** (`css/overlays.css`): the chat bubble (z-index 50) sat on top of the cookie bar (z-index 40) and covered its button. I raised the cookie bar to z-index 60. The notice is now on top while it's showing, and the chat bubble is partly hidden behind it until it's dismissed.
3. **Home page overflowed in Vietnamese** (`css/components.css`): the filter pills didn't wrap, and the longer Vietnamese labels ran past the screen edge. I added `flex-wrap: wrap` to `.filters`.
4. **Account page overflowed** (`css/table.css`, `account.html`): the invoice table was 469px wide on a 328px content area. I let the customer name wrap, and wrapped the table in a `.table-scroll` div with `overflow-x: auto`, so the table scrolls inside its own box and the page no longer scrolls sideways.

The table scroll is a deliberate choice. Five columns don't fit in 328px without cutting content or shrinking text below the minimum, so the table scrolls inside its own box instead.

**Error count:** 15 failures before, 0 after.

**Changed files:** `account.html`, `css/components.css`, `css/overlays.css`, `css/table.css`, `js/drawer.js`.

**Not done:** I didn't run the Mantis look and revert-proof checks that the mantis-fix process asks for. The `mantis` command needs approval in this session. The check passes, but I haven't confirmed that the fixes are real rather than hiding anything. Run `mantis look http://localhost:4351 --routes /,/pricing.html,/account.html` before shipping if you want that confirmation.

I didn't run the project's tests or linter, since the project has no test script. `npm run check:ui` is the only check I ran.
