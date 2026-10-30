I found and fixed four UI problems on the first screen. A final browser check of phone, tablet and desktop, in light and dark, in English and German, shows no errors (it found 2, then 2 more once the phone toolbar was visible again). The TypeScript check passes. Nothing is committed.

1. **The phone toolbar was invisible.** In `packages/excalidraw/components/MobileToolbar.tsx`, the toolbar starts invisible and should fade in once it has scrolled to the selected tool. On first load the selected tool isn't there, so the code crashed with "Cannot read properties of null" before the toolbar was ever shown. That's why the bottom bar was an empty box on phones. It now skips the scroll if there's nothing to scroll to, and always shows the toolbar.

2. **The "Live-Zusammenarbeit…" label was cut off in German.** In `welcome-screen/WelcomeScreen.scss` the welcome menu labels had a narrow fixed width and couldn't wrap, so the German text was cut off. I removed those three rules so the text fits.

3. **Undo/redo sat on top of the toolbar on phones.** This was hidden while the toolbar was invisible. In `Actions.scss`, a stray `top: 2.75rem` pushed the undo/redo row 44px down onto the text and "more tools" buttons, so taps could hit the wrong one. I removed it so the row sits above the toolbar as intended.

4. **The zoom and undo/redo controls stayed light in dark mode.** Their background was a fixed light grey (`#ececf4`). It now uses the theme's surface color, which is the same grey in light mode and switches in dark mode.

- **"Sign up" is still in English** on the German welcome screen. The checker didn't flag it and I didn't change it, so tell me if you want it translated.
- **The checker's "dark mode missing" note is a false alarm.** Excalidraw draws on a canvas over a white page, and it did switch to dark correctly.

I only checked the first screen as it loads, without tapping through menus or drawing. The checker's settings and screenshots are in `.mantis/` in the repo; you may want to delete or gitignore that folder. The latest screenshots are in `%TEMP%\mantis-bench\x-with-neutral-3\.mantis\latest\shots\`.
