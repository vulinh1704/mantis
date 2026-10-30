# Changelog

Full notes, with images, are on the [releases page](https://github.com/vulinh1704/mantis/releases).

## Unreleased

- The GitHub Action's description is 122 characters, so it can be listed on GitHub Marketplace, which refuses more than 125. A test checks the limit.
- `mantis perf`: Chrome now and then reports no LCP entry for an image it did paint. This happened in 1 of 5 desktop visits on a CI runner and 1 in 10 under load locally, and the LCP fell back to a heading. Mantis now flags such a visit: an image on screen that loaded after the last candidate and is much larger. Images Chrome leaves out on purpose are skipped: placeholders, full-viewport backgrounds, transparent images.
  - A flagged visit is left out of the LCP median and is never the representative visit, and the report says so.
  - When every visit is flagged, the report warns that LCP may be too low.
  - perf.json also lists the LCP candidates Chrome reported.
  - Queued performance entries are read before a visit is read (takeRecords).

## 0.7.0 (2026-10-30)

- `mantis mcp` serves Mantis to any MCP client over stdio, with four tools that take the CLI's options: `mantis_look`, `mantis_perf`, `mantis_learn` and `mantis_proof`. Each returns its report as text and its sheet as an image, and reports progress while it runs. `claude mcp add mantis -- npx -y @vulinh1704/mantis mcp`. No new dependencies. `server.json` describes the server for the MCP Registry (`io.github.vulinh1704/mantis`).
- GitHub Action (`uses: vulinh1704/mantis@v0.7.0`): runs `look` or `perf` on a pull request's preview deployment. With `baseline-url` it first measures your live site and compares with it: fixed, new, cover-ups, and the perf receipt. The result goes to a pull request comment that is updated on every push (for `deployment_status` events too, through the deployed commit), to the job summary, and to an artifact with the sheets and screenshots. It fails on errors, on cover-ups only, or never (`fail-on`).

## 0.6.0 (2026-10-30)

- `mantis perf <url>` (first part): every route is loaded N times cold (`--runs`, default 5) in Chromium, throttled like a mid-range phone on slow 4G (`--profile mobile`, the default) or unthrottled (`--profile desktop`). It reports the median and spread of LCP, FCP, TBT, CLS, TTFB, load time, bytes and requests, and explains them: the LCP element, the slowest requests with the server's real wait and the function that made each one, the functions the main thread spent its time in (app and third-party), the long animation frames, and the code that never ran. A dev server is called out. Output: `.mantis/perf/latest/perf.md` and `perf.json`.
- `mantis perf` ranks fixes by impact and fix risk: do first (worth it, low risk), plan, nice to have, your call. Each fix names its culprit (a selector, a URL, or a `file:line` and function), the metric it moves with an estimated saving and how sure that estimate is, and the detected framework's own way to fix it (Next.js, Nuxt, Angular, Vue, React, SvelteKit). Checked:
  - the LCP image: lazy-loaded, or found late;
  - images much larger than they are drawn;
  - files in `<head>` that hold the first paint;
  - first-party functions that hold the main thread;
  - code that never runs;
  - fonts that hide text;
  - layout shifts, grouped by their cause (an image without a size, an element inserted above, a container filled late);
  - a slow HTML response;
  - uncompressed text away from localhost.

  A layout shift saves only what CLS would drop without it, and an image fix saves at most LCP − FCP. Exit code 1 when there is something to do first or to plan.
- `mantis perf` investigates the app's API calls and its third parties:
  - **API calls** are traced to the code that made them, with its callers (`loadConfig` /app.js:4 ← `main` /app.js:51). It finds:
    - slow endpoints, from the server's real wait;
    - calls that wait for each other;
    - the same call made twice;
    - one call per item (N+1);
    - large or uncompressed JSON;
    - a first call that starts late, naming the script it waited for.

    "API data in" (when the last call was answered) is a new metric.
  - **Third parties** are grouped by vendor (Google Analytics, Intercom, YouTube, Stripe and about 50 more, or by site), with:
    - their requests and bytes;
    - main-thread time;
    - render-blocking files and iframes;
    - the fix that suits the kind of vendor (a facade for chat and video, a static map, loading analytics after the page is interactive, self-hosting fonts).

    A costly vendor also gets a "your call" entry: whether it is worth it is a product decision.
- `mantis perf --baseline auto|none|<dir>` compares a run with the previous one of the same URL, profile and storage state. It prints a receipt: `LCP 2.5 s → 36 ms · TBT 121 ms → 0 ms · CLS 0.164 → 0 · 11 fixed · 0 new · 0 cover-ups`.
  - A metric counts as changed only beyond the noise: both runs' spread, 5%, and a floor per metric. Anything less is "within noise".
  - **Perf cover-ups:** a route that got faster because it got emptier is an error, "Faster, or just emptier?". That covers the LCP image turned into text or shrunk, visible text down more than 20%, and first-screen images, headings or controls gone. Findings that went away with the content are listed apart and are not counted as fixed. Exit code 1.
- `mantis perf` draws a sheet, `perf-sheet.png`:
  - the metrics rated against Core Web Vitals;
  - a filmstrip of what the visitor sees, with the first paint and the LCP frame marked;
  - a waterfall of the requests that matter;
  - the first five fixes;
  - main-thread time per third party.

  The filmstrip frames are saved under `filmstrip/`.
- A visit waits for the images on the first screen before it is read, so a lazy or slow hero is the LCP it really is.

## 0.5.1 (2026-10-30)

Fixes from a review of 0.5.0 (#30):
- Markers on right-to-left pages are drawn where the culprit is, also left of x = 0.
- A pseudo-locale cell over a non-Latin page is checked instead of being marked "not localized"; non-Latin text grows too; real locales are compared with the first real locale, not a pseudo one.
- The pseudo-locale leaves inline SVG `<style>` and icon-font ligatures (Material Icons/Symbols) alone, and honours `translate="yes"` inside `translate="no"`.
- Hydration mismatches that the pseudo-locale causes in server-rendered apps are a note, not a console error.
- `direction` reads the direction where the right-to-left text is, so `dir="rtl"` on the app's root element is fine.
- `learn` rejects `--locale-strategy`.

## 0.5.0 (2026-10-30)

- `--locale-strategy path:/{locale} | query:<param> | cookie:<name> | storage:<key>` reaches the other languages of apps that don't follow the browser language: next-intl, i18next, Vue i18n, Rails. A run is compared only with earlier runs that used the same strategy.
- The pseudo-locale (`--locales en,pseudo`) rewrites every visible string about 40% longer, accented and bracketed, including text rendered after load, to find layouts that break with longer text before any translation exists.
- Right-to-left pages: `page-overflow` names the culprit when content sticks out past the left edge (before, only a whole-page issue came out). A new `direction` error flags an Arabic, Hebrew, Persian or Urdu page laid out left to right. `pseudo-rtl` lays the pseudo-locale out right to left.
- README in Vietnamese (`README.vi.md`) and Simplified Chinese (`README.zh-CN.md`), shortened, linking to the English README for details.

## 0.4.0 (2026-10-30)

- Contrast and dark-mode leaks are read from screenshot pixels when axe can't compute the background: text on a `<canvas>` (whiteboards, maps, editors) or under transparent layers (#11).
- `page-overflow` finds overflow hidden by an app shell nested up to four levels deep, and skips screen-reader-only text and marquees (#12).
- The `mantis` skill says a clean report only covers what Mantis measures, and asks the agent to look again after each fix (#13).
- `look` and `learn` write a `.gitignore` into `.mantis/` (#14).
- The agent benchmarks are published in `bench/`, misses included (#16).

## 0.3.1 (2026-10-29)

- The skills now trigger when a UI check is failing ("make `check:ui` pass"), and `mantis-fix` has a "When a failing check must pass" section (#9).
- `mantis-fix` falls back to `npx -y github:vulinh1704/mantis` when the CLI isn't installed (#8).

## 0.3.0 (2026-10-29)

- `mantis learn` records the app's house style; `look` then warns `off-style` on near-copies of house colors, sizes, radii and fonts (#4).
- `--storage-state` reaches pages behind a login (#2).
- Docker image for amd64 and arm64 (#3).
- Fixes from real-world testing: Git Bash route paths, service-worker errors, media overlays (#5).

## 0.2.0 (2026-10-29)

- Cover-up detection: every run is compared with the previous run of the same URL; issues that disappear because their element was hidden, removed, shrunk, cut off or emptied become `cover-up` errors, and vanished controls become `lost` warnings.
- `page-overflow` reports overflow that `overflow-x: hidden` on `html`, `body` or the app root only hides.
- New "field report" sheets with the project's name, logo and repo QR code; `proof` writes a zoomed before/after crop and can open and close the video with cards.

## Before 0.2.0

The first public version (2026-10-27): `look` across viewports, color schemes and locales with 10 detectors, contact sheets, before/after `proof`, and the `mantis`, `mantis-fix` and `mantis-proof` skills.
