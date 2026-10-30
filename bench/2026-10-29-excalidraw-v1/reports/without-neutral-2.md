I made three CSS fixes to the welcome screen, all in `packages/excalidraw/components/welcome-screen/WelcomeScreen.scss`. I couldn't open the app in a browser, because this session is blocked from reaching anything outside the repo. So none of this has been checked on screen, and I haven't run the tests or typecheck. Nothing is committed.

1. **German labels were cut off.** The text in the welcome menu buttons was limited to a fixed width (`8.5rem`) and couldn't wrap. Longer German labels like "Live-Zusammenarbeit..." were clipped. English mostly fit, which is why it showed up mainly in German. I removed those three lines so the labels show in full.
2. **Dark mode menu text was hard to read.** In dark mode the menu items used a dark grey (`--color-gray-80`, `#3d3d3d`) on the near-black background. I changed it to `--color-gray-60`, the same colour the logo and heading already use in dark mode.
3. **Hints disappeared on tablets.** The arrow hints ("Wähle ein Werkzeug…", menu hint, help hint) were hidden on any screen up to 780px tall. That includes an iPad in landscape (768px). I set the cutoff back to 599px, which I believe is upstream Excalidraw's value, so they now hide only on genuinely short screens.

Please check at http://localhost:3001 with browser DevTools set to a phone and a tablet size, German, and dark colour scheme.

One possible issue I left alone: the menu buttons have a 300px minimum width. On screens between about 321 and 332px wide they could overflow slightly. Common phones (360px and wider) aren't affected.
