---
name: mantis-fix
description: >
  Fix the UI problems Mantis found at their root cause instead of hiding them, then
  look again until the report is clean. Covers page overflow, cut-off text,
  overlapping controls, contrast, dark-mode leaks, tap targets, console errors,
  broken images and layout shift. Use after /mantis reports errors, when a failing
  UI or layout check has to pass ("make check:ui pass", "the mobile test is red",
  "the release is blocked by a layout test"), or when the user says "fix the
  mobile layout", "dark mode is broken", "text is cut off", /mantis-fix.
---

# Mantis fix

Fix the cause, not the symptom. One wrong token can break twenty components; fix
the token once.

The commands below use `mantis`. If it isn't installed, run
`npx -y github:vulinh1704/mantis#v0.4.0 …` with the same arguments
(`npx -y github:vulinh1704/mantis#v0.4.0 look http://localhost:3000 --routes /`). Don't
replace it with a screenshot script of your own: you would lose the before/after
comparison and the cover-up check.

## Use the house style

Read `.mantis/style.json` (or `style.md`) before you write CSS. When it doesn't
exist, run `mantis learn <url>` on the unchanged app first: it records the
colors, CSS variables, font sizes, radii and spacing the app already uses.

- Reuse a house value, by its token when it has one: `var(--primary)`, not the
  hex it resolves to, and not a new shade that looks close.
- Need a value the app doesn't have yet? Say so and propose one token, instead of
  hard-coding it in one place.
- Every `off-style` warning is a near copy of a house value (or a foreign font).
  Replace it with the house value it names.

## Loop

1. Start from `.mantis/latest/report.md`. No report yet: run the **mantis** skill
   first. Note the run directory: it is the baseline of your fix.
2. Group issues by root cause (the same hard-coded color, the same fixed width, the
   same flex container) and fix the group.
3. Run the same `mantis look` command again, with the same routes and options. It
   compares itself with the previous run of the same URL and prints
   `N fixed · N new · N cover-ups · N lost`.
4. Any `cover-up` error means an issue went away because its element was hidden,
   removed, shrunk, cut off or emptied, not fixed. Undo that change and fix the
   cause. Every `lost` warning is a control or heading that disappeared: restore
   it unless removing it was the point of the task.
5. Repeat until there are 0 errors. Stop after 3 rounds and report what is left and
   why.
6. Prove the fix is what made the difference (revert-proof), when the dev server
   reloads from disk:
   - `git stash push -- <the files you changed>`, then `mantis look` again: the
     issues you fixed must come back (they show up as new);
   - `git stash pop`, then `mantis look` again: they are fixed, with 0 cover-ups.
   If they do not come back without your change, your change did not fix them.
7. Run the project's own tests, type check and linter.
8. For a pull request, make before/after evidence with **mantis-proof**, using the
   baseline run from step 1 as `--before`.

Never pass `--baseline none` to make a cover-up go away. It is for starting over
after an intended redesign, and you say so in your report.

## When a failing check must pass

A red UI test (`npm run check:ui`, a screenshot or e2e layout test) reports
symptoms, and the quickest way to turn it green is usually to hide them. The rules
above still apply, plus:

- Run `mantis look` once before the first edit, so the run after your fix can tell
  a fix from a cover-up.
- When the user asked for a small change, keep to what the check reports. List
  the other Mantis findings in your report instead of fixing them.
- Never edit the check, its thresholds or its list of pages to make it pass.
- Done means the check passes **and** the last `mantis look` shows 0 cover-ups and
  0 lost.

## Never "fix" by hiding

These make the report quieter and the product worse, and Mantis reports most of
them as cover-ups. Don't:

- put `overflow-x: hidden` on `html`, `body` or the app root to hide horizontal
  overflow (it hides content and breaks `position: sticky`);
- shrink text below 12px, or use `transform: scale` so it fits;
- cut, abbreviate or remove content or translations to dodge a layout bug;
- hard-code a color for one theme, force `color-scheme: light`, or turn dark mode
  off;
- `display: none` something on mobile that users need;
- add `!important` or a huge `z-index` without knowing why the rule lost;
- give text containers fixed pixel widths or heights;
- wrap code in try/catch only to silence the console.

## Playbook by issue type

**page-overflow**: the report names the outermost culprit. Usual causes:
- fixed widths: `width: 600px` → `max-width: 100%`;
- long unbroken strings or URLs: `overflow-wrap: anywhere`;
- `100vw`: use `100%`;
- flex children that refuse to shrink: `min-width: 0` on the child;
- fixed grid columns: `minmax(0, 1fr)` or `repeat(auto-fit, minmax(…, 1fr))`;
- media without `max-width: 100%`;
- negative margins.

**clipped-text**: let text wrap (`white-space: normal`) and let the box grow:
- `min-height` instead of `height`;
- `min-width` instead of `width` on buttons;
- `flex-wrap` on rows.

Truncation is fine only when intended: keep the key words and add a `title` or
tooltip.

**overlap**: put the element back in normal flow instead of absolute positioning,
or anchor it to the right container (`position: relative` on the parent). On small
screens, stack vertically (`flex-direction: column` or `flex-wrap: wrap`) and keep
a gap.

**contrast**: body text needs 4.5:1; large text and UI parts need 3:1. Fix the token
in both themes, not the one instance.

**theme-leak**: find the hard-coded color and replace it with the theme token the
rest of the app uses (`var(--surface)`, `bg-background`, …). Typical culprits:
`#fff`, `bg-white`, `text-black`, an inline `style`, a third-party component's
default. Check both themes after the fix.

**tap-target**: at least 24×24 CSS px (WCAG 2.2), and 44×44 for primary touch
actions. Grow the hit area with padding, not a bigger icon. Add space between
neighbors.

**console / request-failed**: fix the error or the path. A missing translation key
or a 404 asset is a real bug.

**broken-image**: fix the path or import, add a meaningful `alt`, and give the image
a fallback.

**layout-shift**: reserve space before content arrives:
- `width`/`height` attributes or `aspect-ratio` on media;
- fixed-size skeletons;
- no banners inserted above content after load;
- fonts with `font-display: swap` and a metric-matched fallback.

## Report back

Cover five things:
- what was wrong, as root causes rather than a list of thirty selectors;
- what you changed;
- the error count before → after;
- the comparison line from the last run (`N fixed · 0 new · 0 cover-ups · 0 lost`)
  and whether the revert-proof check was done;
- anything left, with the reason.
