I found and fixed 9 UI problems on the first screen. I checked each fix with Playwright screenshots of the running app (German and English, light and dark) at sizes from 360×640 up to 1440×900. Typecheck passes and the full test suite passes (149 files). Nothing is committed.

**Phones**
1. **The bottom toolbar was invisible.** The toolbar starts hidden and is shown once a script finds the selected tool. That script looked for a class name `.ToolIcon--selected`, which no longer exists (the CHANGELOG says it's now `.ToolIcon--checked`). The lookup failed, the script crashed, and the toolbar stayed hidden. I fixed the class name and added null checks. (`MobileToolbar.tsx`)
2. **Undo/redo covered the toolbar.** `.mobile-shape-actions` had `top: 2.75rem`, which pushed the undo/redo row 44px down on top of the tools. I removed it. (`Actions.scss`)

**Tablets**
3. **The top toolbar ran off the right edge at 820px.** In the tablet ("compact") layout the gap between tools was 3, which is wider than the desktop gap of 1. That's backwards, and it made the toolbar 654px wide on tablet against 540px on desktop. I set it to 0.5, the compact value `LayerUI` already defines. (`Toolbar.tsx`)
4. **The welcome hints were hidden on any screen shorter than 780px**, which includes most tablets in landscape. I set the cutoff back to 599px.

**Dark mode**
5. **The zoom controls were a light box on the dark canvas.** Their background was a hard-coded `#ececf4`. It now uses `var(--color-surface-low)`, which looks the same in light mode and turns dark in dark mode. (`Actions.scss`)
6. **The welcome menu items (Open, Help, …) were nearly invisible.** They used `--color-gray-80` (#3d3d3d) on a #121212 background. I changed them to `--color-gray-60`.
7. **The Share button was washed out in both themes.** Its background was `--color-primary-light`, a pale tint, with light text on top. It's back to `--color-primary`. (`LiveCollaborationTrigger.scss`)

**German**
8. **Menu labels were cut off** ("Live-Zusammenarbeit..." lost its "..."). The label had a fixed max width with `overflow: hidden` and `nowrap`; I removed those.
9. **The "pick a tool" hint ran into the logo** on iPad landscape. It wrapped to four lines inside a fixed 120px box. It now sizes to its text, between 120px and 200px, with balanced line breaks. This also changes English slightly: "Pick a tool & Start drawing!" now breaks into two different lines.

I also filled in the missing German translation for "Sign up" (`"Registrieren"`), which was showing in English. If your translations sync from Crowdin, add it there too or the next sync will overwrite it. Many other German strings are also empty and fall back to English, but none of them are on the first screen.

Screenshots from before and after the fixes are in `%TEMP%\claude\mantis-bench-x-without-neutral-2\fcba63b5-d76f-4702-93ed-161aae738e90\scratchpad\before` and `%TEMP%\claude\mantis-bench-x-without-neutral-2\fcba63b5-d76f-4702-93ed-161aae738e90\scratchpad\after3`.
