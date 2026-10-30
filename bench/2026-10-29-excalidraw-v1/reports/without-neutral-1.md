I fixed four problems on the first screen (the welcome screen), but I haven't seen the result in a browser. The headless-browser screenshot I tried was blocked, so this all comes from reading the code. Please check http://localhost:3001 (the dev server should pick up the changes on its own) on a phone and a tablet, in German and in dark mode, before relying on it.

**What was wrong and what I changed:**

1. **German menu labels were cut off.** The text in the welcome menu items was capped at a fixed width with wrapping and overflow turned off. Longer German labels like "Live-Zusammenarbeit..." got clipped, worst on phones. I removed that cap so the labels fit inside the menu items normally (`WelcomeScreen.scss`, `.welcome-screen-menu-item__text`).
2. **Menu items were nearly invisible in dark mode.** Their text was dark grey (`#3d3d3d`) on a near-black background (`#121212`). I changed it to the lighter grey (`--color-gray-60`) that the rest of the welcome screen already uses in dark mode.
3. **The centre content overlapped the toolbar hint on tablets.** The rule that pushes the logo, heading and menu below the top toolbar was missing. Together with the longer three-line German heading, it ran into the "Wähle ein Werkzeug…" hint. I added that offset back, but only for tablet and desktop layouts. On phones the toolbar is at the bottom, and the offset would just squeeze small screens.
4. **The arrow hints disappeared on most tablets.** They were hidden whenever the screen was shorter than 780px, which covers iPads and most Android tablets in landscape. Now they're only hidden below 600px.

I also made one small dark-mode change in `excalidraw-app/index.html`. The script that runs before the app loads treated a first visit as light mode, while the app itself follows the system setting. That gave dark-mode users a white flash on their first visit. The script now follows the system setting too.

Nothing is committed, and I didn't run the test suite.
