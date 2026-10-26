---
name: mantis-fix
description: >
  Fix the UI problems Mantis found at their root cause instead of hiding them, then
  look again until the report is clean. Covers page overflow, cut-off text,
  overlapping controls, contrast, dark-mode leaks, tap targets, console errors,
  broken images and layout shift. Use after /mantis reports errors, or when the
  user says "fix the mobile layout", "dark mode is broken", "text is cut off",
  /mantis-fix.
---

# Mantis fix

Fix the cause, not the symptom. One wrong token can break twenty components; fix
the token once.

## Loop

1. Start from `.mantis/latest/report.md`. No report yet: run the **mantis** skill
   first.
2. Group issues by root cause (the same hard-coded color, the same fixed width, the
   same flex container) and fix the group.
3. Run the same `mantis look` command again, with the same routes and options.
4. Repeat until there are 0 errors. Stop after 3 rounds and report what is left and
   why.
5. Run the project's own tests, type check and linter.
6. For a pull request, make before/after evidence with **mantis-proof**.

## Never "fix" by hiding

These make the report quieter and the product worse. Don't:

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

Cover four things:
- what was wrong, as root causes rather than a list of thirty selectors;
- what you changed;
- the error count before → after;
- anything left, with the reason.
