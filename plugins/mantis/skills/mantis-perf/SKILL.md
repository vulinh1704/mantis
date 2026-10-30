---
name: mantis-perf
description: >
  Measure how fast the app really is in a real browser (a mid-range phone on slow
  4G by default), find what makes it slow down to the file, function or request,
  and fix it in order of impact and risk, with a before/after receipt that catches
  "optimizations" that only remove content. Covers LCP, layout shift, blocking
  time, slow or chained API calls, N+1, duplicate requests, oversized images,
  unused code and third-party scripts. Use when the user says "the page is slow",
  "improve Lighthouse/Core Web Vitals", "why is LCP bad", "make it load faster",
  "which API is slow", "is this script slowing us down", /mantis-perf.
---

# Mantis perf

Measure first, fix the biggest safe thing, measure again. Never make a number
better by removing what the page shows.

The commands below use `mantis`. If it isn't installed, run
`npx -y @vulinh1704/mantis@0.6.0 …` with the same arguments.

## 1. Measure a production build

Dev servers are slow in ways users never see (unminified code, HMR, React
development builds). Build and serve the app the way it ships:
`npm run build && npm run preview` (Vite), `next build && next start`,
`nuxt build && nuxt preview`, … Only a dev server available? Say that the
numbers are indicative; Mantis notes it in the report too.

```
mantis perf http://localhost:4173 --routes /,/pricing
```

- `--profile mobile` (default) is a mid-range phone on slow 4G; `--profile desktop`
  is unthrottled. Keep the same profile for before and after.
- `--runs 5` (default) cold visits per route; the median is reported with its
  spread. Use `--runs 3` for a quick loop, 5 or more for the final receipt.
- Pages behind a login: `--storage-state <file>` (see the mantis skill).

Read `.mantis/perf/latest/perf.md`. It starts with **Fixes, ranked**, in buckets:

| bucket | means |
|---|---|
| Do first | worth it, low risk: do these now |
| Plan | worth it, the fix needs care (changes logic, script order, an API) |
| Nice to have | small gains |
| Your call | a product decision (for example dropping a vendor): ask, never do it on your own |

Each fix names its culprit (a selector, a URL, or a `file:line` and function, with
the functions that called it), the metric it moves with an estimated saving, how
sure that estimate is, and the framework's own way to fix it when Mantis detected
the framework.

## 2. Fix at the root, biggest safe saving first

Work through **Do first**, then **Plan**. For each one:

- Open the culprit it names and fix the cause there: the image's attributes, the
  function's algorithm, the order of the scripts, the call that waits for another.
- Prefer the framework's own tool when the fix names one (`next/image`,
  `next/dynamic`, `NgOptimizedImage`, `@defer`, `useFetch` with a key, …).
- API findings (slow, chain, N+1, payload) often need a server change. Do the
  client side (start calls together, dedupe, batch when an endpoint exists) and
  list the server side for the user.

Never:
- remove or hide content, images, data or controls to make a metric better;
- lazy-load or defer what the first screen shows;
- drop a third party, a feature or tracking without asking ("Your call").

## 3. Measure again: the receipt

Run the same command. It compares itself with the previous perf run of the same
URL, profile and storage state:

```
vs 2026-11-01T10-12-00: LCP 4.8 s → 1.9 s · TBT 1.2 s → 210 ms · CLS 0.164 → 0 · 551 KB → 160 KB · 9 fixed · 0 new · 0 cover-ups
```

- A metric only counts as changed beyond the noise (both runs' spread); `≈` means
  within noise: don't claim it.
- A **cover-up** ("Faster, or just emptier?") means the route got faster because
  its LCP image, text, first-screen images, headings or controls went away. Undo
  that change and fix the cause instead. Exit code 1.
- **New** findings came with your change: look at them before moving on.

Repeat until nothing is left to do first or to plan, or stop after 3 rounds and
report what is left and why. Then run the project's own tests, type check and
linter.

## 4. Report

Give the user:
- the receipt line, and `.mantis/perf/latest/perf-sheet.png` (metrics, filmstrip,
  waterfall, the fixes, third parties);
- what you fixed, each with its culprit;
- the **Plan** items you did not do and why, and the server-side work for the
  API findings;
- every **Your call** item as a question.

Lab numbers are not field data: INP needs real interactions, so TBT and long
animation frames stand in for responsiveness. Say so when you report.
