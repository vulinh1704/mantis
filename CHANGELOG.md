# Changelog

Full notes, with images, are on the [releases page](https://github.com/vulinh1704/mantis/releases).

## Unreleased

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
