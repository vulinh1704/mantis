I made five CSS fixes to the first screen, all in one file: `packages/excalidraw/components/welcome-screen/WelcomeScreen.scss`. I couldn't open a browser from this session, so I haven't checked any of this visually or run the tests. I found the problems by reading the code. Please check the result at http://localhost:3001 on a phone-sized and a tablet-sized window, in German and in dark mode. Nothing is committed.

1. **German: menu labels were cut off.** Each menu item's text was limited to 8.5rem on one line, with anything longer hidden. Longer German labels like "Live-Zusammenarbeit..." were clipped mid-word. I removed that limit so labels show in full.

2. **Dark mode: menu items were almost invisible.** In dark mode the menu text used a very dark gray (`#3d3d3d`) on a near-black background (`#121212`). I changed it to the lighter gray (`#7a7a7a`) that the shortcut text and the hints next to it already use.

3. **Heading lines too tight.** The heading had a line spacing of 1.35rem for 1.125rem text. On phones the three-line German heading wraps a lot, and the tight spacing made lines crowd each other and could clip umlauts. I went back to the normal line spacing.

4. **Phones: menu wider than the screen.** Menu items had a fixed minimum width of 300px inside a container with 1rem padding on each side. On screens narrower than about 332px they stuck out past the edge. The minimum is now 300px or the available width, whichever is smaller.

5. **Tablets: hints disappeared in landscape.** The arrow hints were hidden on any screen shorter than 780px, which includes a landscape iPad (768px tall). I changed the cutoff to 599px to match the phone breakpoint used elsewhere in the code. The hints may never have shown on tablets in your fork, so check that they look right there once they appear.
