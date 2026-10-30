I fixed the first screen on phone, tablet and desktop, in English and German, light and dark. I checked it in a real browser with the UI checker Mantis: it went from 18 errors to 0, and the type check passes. Nothing is committed.

**Phones**
- **Missing toolbar:** the bottom toolbar never appeared because a startup script crashed looking for an old class name (`.ToolIcon--selected`, now `.ToolIcon--checked`). It stopped before making the toolbar visible. Fixed in `MobileToolbar.tsx`, which now also can't crash if the element is missing.
- **Overlapping buttons:** once the toolbar showed up, undo/redo sat on top of the Text and "more tools" buttons, so taps could hit the wrong one. A leftover `top: 2.75rem` in `Actions.scss` pushed them down; I removed it.

**Tablets**
- **Toolbar too wide:** the tablet layout used 12px between tools instead of the intended tighter spacing, so the toolbar pushed the sidebar button off the right edge at 768px. Fixed in `Toolbar.tsx`.

**German**
- **Cut-off menu text:** "Live-Zusammenarbeit…" was clipped because the welcome menu labels had a fixed maximum width and no wrapping. I removed that limit in `WelcomeScreen.scss`.

**Dark mode**
- **Light zoom box:** the zoom box had a hard-coded light background, so "100%" was almost invisible. It now uses the theme color (`Actions.scss`).
- **Unreadable text:** the welcome menu items were dark gray on a black background.

**Contrast in both themes (14 errors)**
- **Welcome screen and hint bar:** the hint text, arrow labels, menu items and shortcuts were too faint. I moved them to darker grays in light mode and lighter ones in dark mode (`WelcomeScreen.scss`, `HintViewer.scss`).
- **Share button:** it had white text on a pale purple background. It now uses the solid primary purple (`LiveCollaborationTrigger.scss`).
- **"Try Excalidraw+" banner:** the title and subtitle are now in darker purples (`excalidraw-app/index.scss`).

**Left as is**
- **Two style warnings on desktop:** the banner subtitle's purple is a slightly darker shade of the app's main purple. The main purple failed the contrast check on that background, so I kept the readable one.
- **Not checked:** Mantis only checked the first screen. It didn't open menus or dialogs, or test hover and focus states.

The overview image of all 12 screens is at `.mantis/latest/contact-sheet.png`, and the full report is `.mantis/latest/report.md`.
