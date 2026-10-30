---
name: mantis
description: >
  Look at the UI before calling it done. Opens the running app in a real browser,
  checks every screen size, light and dark mode, and other languages, and reports
  what is actually broken: page overflow, cut-off text, overlapping controls,
  unreadable contrast, dark-mode leaks, tiny tap targets, console errors, broken
  images, layout shift. Use after any frontend change, before saying a UI task is
  done, when a UI, layout or screenshot check fails (a red check:ui, a failing
  mobile e2e test, a release blocked by one), or when the user says "check the
  UI", "does it work on mobile", "dark mode looks off", /mantis.
---

# Mantis

A mantis shrimp sees 12 color channels. People see 3. A coding agent that never
opens the browser sees 0.

**Rule:** a UI change is not done until you have looked at it rendered. "The code
looks right" is not evidence. A Mantis run with zero errors is.

## 1. Get the app running

- Use the project's own dev command (`npm run dev`, `pnpm dev`, `rails s`, …) and
  note the URL. If it is already running, reuse it.
- List the routes your change touches. Add `/` when the change is global
  (layout, theme, fonts, CSS reset).
- Pages behind a login or onboarding: pass `--storage-state <file>`, a Playwright
  storage state with the session's cookies and localStorage. Ask the user for one,
  or make it: `npx playwright@1.64.1 codegen --save-storage=.mantis/auth.json <login-url>`
  (the user signs in and closes the window), or a short Playwright script that signs
  in with a dev or seed user and calls `context.storageState({ path })`. When the
  app only checks a localStorage flag (onboarding done), write the JSON by hand.
  The file holds a live session: keep it in `.mantis/` or elsewhere out of git.
- If you can't reach a page, say so in your report instead of skipping it silently.

## 2. Look

```bash
mantis look http://localhost:3000 --routes /,/settings
```

If `mantis` isn't installed, run `npx -y github:vulinh1704/mantis#v0.4.0 look …` instead.
Without Node or a browser, use the Docker image (`ghcr.io/vulinh1704/mantis`, see the
README for how it reaches a dev server on the host).

- `--locales en,vi` when the app has translations. Longer languages (Vietnamese,
  German) break layouts that look fine in English.
- `--dark-strategy class:dark` or `--dark-strategy attr:data-theme=dark` when dark
  mode is a class or attribute toggle rather than the OS setting. Check how the app
  switches themes before choosing.
- Keep the default screens (mobile 360, tablet 768, desktop 1440). Never drop
  mobile to make a report pass.
- Before you change styles, run `mantis learn <url>` (same routes) on the
  unchanged app when `.mantis/style.json` doesn't exist yet. Every later `look`
  then reports `off-style` warnings: colors, font sizes and radii that are near
  copies of the house values, and fonts the app uses nowhere else.
- Exit code: `0` no errors, `1` errors found, `2` the page could not be loaded
  (is the server up, on that port?).

## 3. Read the evidence, then look at it

1. Read `.mantis/latest/report.md`: issues grouped by type, with the selector, the
   screens where each appears, and the screenshot file. When an earlier run of the
   same URL exists, the report also compares with it: what was fixed, what is new,
   and any `cover-up` (an issue hidden instead of fixed).
2. Open the screenshots of the worst screens in `.mantis/latest/shots/`. Errors
   are boxed in red and warnings in amber, each with its issue number. Look at the
   image before deciding; a selector alone can mislead.
3. `.mantis/latest/contact-sheet.png` shows every screen at once.
4. A clean report means clean for what Mantis measures, not "nothing is wrong".
   Scan the sheet and the shots for what it can't judge: text over photos or
   gradients, a control that is missing, spacing that looks off. Say what you saw.
5. One bug can hide another: an invisible toolbar can't overlap anything. After a
   fix, look again before you call the report final.

## 4. Decide

- Errors in code you changed: fix them now with the **mantis-fix** skill, then
  look again with the same command.
- Errors that were already there before your change: tell the user what you saw.
  Don't silently rewrite unrelated code.
- Warnings: fix them when cheap and in scope; otherwise list them.

## 5. Report back

Say what Mantis checked (routes × screens × themes × languages), the error counts
before → after, and where the contact sheet is. Say plainly what you could not
check.

## Limits

- Mantis checks that the rendered page works, not whether it is beautiful. Pair it
  with a design skill for taste.
- It doesn't click through flows or test hover and focus states yet. Visit a route
  that shows the menu or dialog you changed, or say it was not checked.
- It doesn't measure animation smoothness.
- Contrast on canvas apps and under transparent layers is read from the
  screenshot. Text over photos, CSS background images and gradients is not
  checked: look at those yourself.
