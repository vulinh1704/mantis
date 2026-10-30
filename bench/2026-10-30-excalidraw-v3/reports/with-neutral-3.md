I fixed the first-screen problems, and the last full check came back with no errors on phone, tablet and desktop, in light and dark, in English and German. Nothing is committed.

**What was wrong**
1. **Phones:** the bottom toolbar never appeared. On load it looked for the active tool using an old class name, `.ToolIcon--selected`, which the CHANGELOG says was renamed to `.ToolIcon--checked`. That threw an error, so the step that fades the toolbar in never ran and it stayed invisible.
2. **Phones, hidden behind #1:** once the toolbar showed up, undo/redo sat on top of its last two buttons. A stray `top: 2.75rem` on `.mobile-shape-actions` pushed that row down onto the toolbar.
3. **Tablets:** the top toolbar was too wide and pushed the Share and Library buttons 62px off-screen. The tablet layout used a larger gap between tools (12px) than desktop (4px), which is backwards from the spacing set in `LayerUI.tsx`.
4. **German:** menu labels were cut off ("Live-Zusammenarbeit…") by a fixed `max-width`, `nowrap` and `overflow: hidden` on the label.
5. **Dark mode:** the zoom bar had a hard-coded light background (`#ececf4`), so "100%" was almost invisible. Welcome-screen menu text in dark mode was dark gray on black (1.7:1 contrast).
6. **Text too faint to read, both themes:** the welcome text, hints, menu items and shortcut labels used grays at about 2:1 contrast (4.5:1 is the readable minimum). The Share button was white on pale lilac (1.27:1), and the Excalidraw+ banner was also too faint.

**What I changed**
- `MobileToolbar.tsx`: uses the correct class, finds the toolbar through a React ref instead of a page-wide search, and still fades the toolbar in if no tool is highlighted.
- `Actions.scss`: removed the stray offset, and the zoom/undo bar now uses the theme token `var(--color-surface-low)`.
- `Toolbar.tsx`: the tablet tool gap is now `0.5` (2px), matching the spacing in `LayerUI.tsx`.
- `WelcomeScreen.scss` and `HintViewer.scss`: removed the label clipping. The text now uses darker grays the theme already has (`--color-gray-70` in light mode; `--color-gray-40`/`-50` in dark mode).
- `LiveCollaborationTrigger.scss`: the Share button background is now `--color-primary`.
- `excalidraw-app/index.scss`: the banner title and subtitle now use `--color-primary-darker`.

**Results**
- **Errors:** 18 before, 0 after. The last run reported 18 fixed, 2 new, 0 cover-ups, 0 lost; the 2 new are both warnings, explained below. No fix works by hiding anything.
- **Proof the changes did it:** I stashed my changes and re-ran the check, and all 18 errors came back. With the changes restored the result was 0 errors again.
- **Project checks:** type check passes, and lint and formatting pass on the changed files. The package tests (1,599) pass, but the first run had 31 errors because the test environment has no `scrollIntoView`. I changed that call to `?.scrollIntoView?.()`, the same pattern `CommandPalette.tsx` and `FontPickerList.tsx` use, and the next run was clean.
- **Not re-checked:** I didn't run the screen check again after that last one-line change. It only affects the test environment, not real browsers.

**What's left**
- **Two style warnings:** the checker flags the banner's new purple as close to, but not the same as, the main purple. I kept it on purpose: the main purple fails contrast on that background, and the new one is the theme's existing `--color-primary-darker` token, not a new hex value.
- **Design change for you to review:** the welcome screen's gray hint text is noticeably darker now, because the old shade was unreadable.
- **Not checked:** I only checked the first screen. Menus, dialogs and hover states weren't looked at.

The latest contact sheet is at `%TEMP%\mantis-bench\x-with-neutral-3\.mantis\latest\contact-sheet.png`. The `.mantis/` folder is untracked, so add it to `.gitignore` or delete it.
