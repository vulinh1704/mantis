I fixed six problems on the first screen. Nothing is committed. Mantis checked the home page at phone (360px), tablet (768px) and desktop (1440px) widths, in light and dark, in English and German. It went from **2 errors to 2 → 0**, and I also looked through the screenshots myself.

**What was broken and why:**

1. **The phone toolbar was blank, with a console crash.** The code looked for the active tool by a CSS class nothing uses (`.ToolIcon--selected` instead of `.ToolIcon--checked`). It crashed, so the toolbar was never made visible. Fixed in `packages/excalidraw/components/MobileToolbar.tsx`; it also no longer crashes if no tool matches.
2. **Undo/redo covered tools on phones.** This only showed up once the toolbar appeared. A stray `top: 2.75rem` pushed the undo/redo row down onto the toolbar. Removed in `packages/excalidraw/components/Actions.scss`.
3. **The tablet top bar ran off the right edge.** The narrower tablet toolbar had 12px gaps between tools instead of 2px, which made it about 110px wider than the desktop one. That pushed the Share and sidebar buttons off-screen. Fixed in `packages/excalidraw/components/Toolbar.tsx:262`.
4. **"Live-Zusammenarbeit…" was cut off in German.** The welcome-menu label had a fixed maximum width with hidden overflow. I removed that so long German labels fit (`WelcomeScreen.scss`).
5. **The zoom panel stayed light in dark mode**, and its "100%" text was unreadable. Its background colour was hardcoded instead of using the theme's panel colour (`Actions.scss`).
6. **The Share/Teilen button had almost unreadable text:** white on pale lavender in light mode. It now uses the brand purple (`LiveCollaborationTrigger.scss`).

**Things to know:**
- Mantis didn't flag problems 3, 5 and 6; I found them by looking at the screenshots.
- Dark mode does follow the system setting. Mantis notes that the page background stays white in dark mode, but that's how Excalidraw darkens the canvas (with a colour filter), not a bug.
- I couldn't run `yarn test:typecheck` because the command was blocked by a permission prompt. The two TypeScript edits are small, but please run it before committing.
- Only the first screen was checked, not menus or dialogs.

The final overview of all 12 screens is in `.mantis/latest/contact-sheet.png`. Mantis wrote the `.mantis/` folder into the repo, so delete it or add it to `.gitignore` before you commit.
