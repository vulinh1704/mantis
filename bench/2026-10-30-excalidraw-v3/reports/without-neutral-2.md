I fixed eight UI problems on the first screen. I checked each one with Playwright screenshots of the running app at phone (320 and 375px wide), tablet (portrait and landscape) and desktop sizes, in German and English, light and dark. The type check passes. I didn't run the test suite (`yarn test:update`) and didn't commit anything.

**Phones**
1. **Empty bottom toolbar.** The phone toolbar starts hidden and is only revealed by a script that looks for a CSS class that doesn't exist anywhere. That script crashed on every load, so the toolbar never appeared. I removed the script and the hiding rule (`MobileToolbar.tsx`, `MobileToolbar.scss`).
2. **Undo/redo on top of the toolbar.** A stray `top: 2.75rem` pushed the undo/redo row down into the tool buttons. Removed (`Actions.scss`).

**Tablets**
3. **Top toolbar ran off the screen in portrait.** On tablets the gap between tool buttons was set larger than on desktop. That pushed the toolbar and the Share button past the right edge at 768px. I set it to 0.5, the compact value already defined in `LayerUI.tsx` but not used (`Toolbar.tsx`).
4. **Welcome hints missing.** The "pick a tool" and help hints were hidden on any screen under 780px tall, which includes landscape tablets and 768px-tall laptops. I lowered the cutoff to 599px. On screens 600–900px tall I also moved the logo and menu down so the toolbar hint doesn't overlap the logo. Phones are excluded from that shift (`WelcomeScreen.scss`).

**German**
5. **"Live-Zusammenarbeit..." was cut off.** The menu item labels had a fixed maximum width with overflow hidden, which clipped the longer German label. I removed the limit (`WelcomeScreen.scss`).

**Dark mode**
6. **Welcome menu items were barely visible.** They used a gray almost as dark as the background. I changed it to a lighter gray, the same one the shortcut hints next to them use.
7. **Zoom and undo/redo panel stayed light.** Its background was a fixed light color, so it showed as a bright box with nearly unreadable buttons. It now uses the theme's surface color (`Actions.scss`).

**Both themes**
8. **Share ("Teilen") button nearly invisible.** It had white text on a pale lavender background. It now uses the solid primary color (`LiveCollaborationTrigger.scss`).

The two hint breakpoints (599px and 600–900px) are my choice based on Excalidraw's usual layout, so check they suit the devices you care about. The screenshots are in `%TEMP%\claude\mantis-bench-x-without-neutral-2\83966258-de5c-4c52-8661-63c9b23bcde8\scratchpad\after` if you want to look.
