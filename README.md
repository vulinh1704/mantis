<p align="center">
  <img src="assets/mantis.png" width="200" alt="Mantis, a rainbow mantis shrimp wearing boxing gloves">
</p>

<h1 align="center">Mantis</h1>

<p align="center">
  <em>Sees 12 color channels. You see 3. Your coding agent sees 0.</em>
</p>

<p align="center">
  <a href="https://github.com/vulinh1704/mantis/actions/workflows/ci.yml"><img src="https://github.com/vulinh1704/mantis/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <img src="https://img.shields.io/badge/status-early%20development-111111?style=flat-square" alt="Early development">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT license">
  <img src="https://img.shields.io/badge/skills-SKILL.md-111111?style=flat-square" alt="Agent Skills format">
  <img src="https://img.shields.io/badge/browser-Playwright-111111?style=flat-square" alt="Playwright">
</p>

<p align="center">
  <a href="https://github.com/vulinh1704/mantis/releases/download/v0.3.0/mantis-intro.mp4"><img src="assets/intro-thumb.jpg" width="880" alt="Mantis in 60 seconds: an agent says it fixed the layout but hid the menu button, and Mantis catches the cover-up"></a>
  <br><sub>▶ <a href="https://github.com/vulinh1704/mantis/releases/download/v0.3.0/mantis-intro.mp4">Watch the 60-second intro</a> (MP4, 4 MB) · <a href="https://github.com/vulinh1704/mantis/releases/download/v0.3.0/mantis-intro-1080p.mp4">1080p</a></sub>
</p>

---

Your coding agent builds UI with its eyes closed. It writes the CSS, says
**"Done ✅"**, and never opens the browser.

Then someone opens the page on a phone:
- the menu runs off the screen;
- in dark mode one card is still white, with white text on it;
- the Vietnamese button label is cut in half.

**Mantis catches the UI bugs your agent can't see, and the ones it hides.** It:
1. opens the real app;
2. checks every screen size, both themes and every language you ship;
3. boxes what is broken in red;
4. fixes it at the root, and flags any "fix" that only hides the bug;
5. proves it with before/after screenshots.

<p align="center">
  <img src="assets/contact-sheet.png" width="880" alt="A Mantis contact sheet: every page on mobile, tablet and desktop, in light and dark mode, with problems boxed in red">
</p>

## What it catches

| Problem | What you see | Why agents miss it |
|---|---|---|
| Page overflow | Sideways scrolling on a phone | They picture the desktop layout |
| Cut-off text | "Đăng ký nhận bản ti…" | They test with short English strings |
| Overlap | A badge sitting on top of a button | Absolute positioning looks fine at one width |
| Contrast | Gray text you can barely read | Colors are chosen in code, never seen |
| Dark-mode leaks | One white card in a dark page | A hard-coded `#fff` the theme can't reach |
| Tiny tap targets | 16px icon buttons on a phone | A mouse is precise, a thumb isn't |
| Console errors, broken images | Red errors, empty boxes | Nobody opened DevTools |
| Layout shift | Content jumps while you read | Everything loads instantly on localhost |
| Off-style values | A blue one shade off your brand, a 15px corner among 16px ones | They hard-code a value instead of using your token |

## How it works

1. **Look.** `/mantis` runs the app through every screen × theme × language in
   a real browser and writes a report the agent reads, with annotated
   screenshots.
2. **Fix.** `/mantis-fix` fixes causes, not symptoms. It never puts
   `overflow-x: hidden` on the body, shrinks text until it fits, or turns dark
   mode off, and the next run checks that it didn't.
3. **Prove.** `/mantis-proof` makes a before/after sheet, a close-up of one
   fixed finding, and optionally a video, for your pull request.

```bash
mantis look http://localhost:3000 --routes /,/settings --locales en,vi
```

Each language cell sets the browser locale and `Accept-Language`. Many apps pick their language another way, and `--locale-strategy` handles that (from v0.5):

| The app switches language by | Pass |
|---|---|
| a URL prefix, e.g. `/vi/settings` | `--locale-strategy path:/{locale}` |
| a query parameter | `--locale-strategy query:lang` |
| a cookie (next-intl, Rails) | `--locale-strategy cookie:NEXT_LOCALE` |
| localStorage (i18next) | `--locale-strategy storage:i18nextLng` |

A language whose page text comes out the same as the first one is reported as "not localized". That usually means the strategy is wrong.

**No translations yet?** Add the pseudo-locale (from v0.5): `--locales en,pseudo`. That cell loads the first language and rewrites every visible string the way translations grow. "Subscribe" becomes `[Šûƀƀšççŕîîƀéé]`: accented, about 40% longer, and bracketed, so a missing `]` shows the end was cut. Text the app renders later is rewritten too. Code, form input and `translate="no"` content are left alone. The pseudo-locale finds layouts that break with longer text. It can't tell which strings are hard-coded, because it rewrites them all.

<p align="center">
  <img src="assets/proof.png" width="880" alt="Mantis fix receipt: the same 24 screens before and after the fixes, errors going from 14 to 0, with 0 cover-ups">
</p>

## Fixed, or just hidden?

An agent told to make the report clean can make it clean without fixing
anything. Every `mantis look` compares itself with the previous run of the same
URL, so these tricks don't work:

| Trick | What Mantis reports |
|---|---|
| `overflow-x: hidden` on `html`, `body` or the app root | The overflow, still: the element that is cut off, and the rule that hides it |
| Hide the broken element (`display: none`, `visibility: hidden`, `opacity: 0`) | `cover-up`: the issue is gone, but so is the element |
| Hide the *other* element of an overlap | `cover-up` on that element |
| Shrink the text until it fits | `cover-up`: 16px → 7px |
| Clip it, or cut the text short | `cover-up`: less of it is visible, or fewer characters |
| A button, link or heading quietly disappears | `lost` warning |

A cover-up is an error, so the run still fails. When the fix is honest, the run
ends with a receipt:

```
Mantis: 0 errors, 0 warnings in 24 cells
  vs 2026-10-29T11-51-22: 18 fixed · 0 new · 0 cover-ups · 0 lost
```

## Numbers

What has been measured so far:

- **Planted bugs.** `fixtures/buggy-app` has 13 planted UI bugs, listed in
  [`PLANTED.json`](fixtures/buggy-app/PLANTED.json). Mantis reports every one
  of them in exactly the screen, theme and language cells where it was planted,
  and nothing else. On `fixtures/clean-app`, the same app with every bug fixed,
  it reports zero issues. Both checks run in CI.
- **Cover-ups.** Four tricks applied to `buggy-app` behind the same URL (hide
  the overflow with `overflow-x: hidden`, hide the menu button, hide the button
  it overlaps, shrink a label to 7px) are all still reported or flagged as
  cover-ups. Swapping in `clean-app`, the honest fix, gives every issue fixed,
  0 new, 0 cover-ups and 0 lost. This runs in CI too.
- **Cover-up false alarms.** Two runs in a row on tailwindcss.com, vercel.com,
  notion.com and stripe.com reported 0 cover-ups and 0 lost controls. On
  vnexpress.net, where the news changes between runs, they reported 0 cover-ups
  and one grouped "lost" warning. Checked on 2026-10-29.
- **Real sites.** On 10 public sites (example.com, playwright.dev, Hacker News,
  tailwindcss.com, MDN, svelte.dev, react.dev, gov.uk, vercel.com and
  stripe.com), 18 of the 21 errors it reported held up when checked by hand.
  The 3 false positives were demo frames on tailwindcss.com. Checked on
  2026-10-26.
- **House style.** On `buggy-app`, `mantis learn` lists exactly the 3 near-duplicates planted there:
  - a color ΔE 0.4 from `--muted`;
  - a 13.6px label in a 14px scale;
  - a 15px corner next to `--radius: 16px`.

  On `clean-app` it finds none. Each of four near copies hard-coded into `clean-app` (a color, a font size, a radius and a font) gives one `off-style` warning; a clearly new color gives none. These checks run in CI.
- **Off-style false alarms.** Learning a public page and looking at it again right away gave 0 off-style warnings on tailwindcss.com and vercel.com. stripe.com gave 2, linear.app 4 and github.com 4. All 10 were inside live product demos or a lazily loaded repo grid, whose content changes between loads. Checked on 2026-10-29.

### Agent benchmark

The same agent (Claude Code, Opus 5.5 and Haiku 5.5) did the same UI tasks with
and without the Mantis skills, 3 runs per cell, graded by a hidden Playwright
grader that never uses Mantis's detectors. Everything is in [`bench/`](bench/):
the method, the planted bugs, the graders, every agent's final report and diff,
the ties and the losses.

- **Mantis did not make Opus 5.5 fix more bugs.** It tied on two small apps
  (13.0 vs 12.7 of 13, 9 vs 9 of 9). On a fork of Excalidraw it was behind with
  v0.3.1 (6.0 vs 6.7 of 7) and ahead with v0.4.0 (7.0 vs 6.7). Those fixes were
  tuned on that same fork.
- **Under pressure, it got hidden bugs reported.** Told "make `check:ui` pass,
  keep it small", both arms fixed only what the check covers. With Mantis, the
  final report also listed the bugs the check can't see: 3.7 of 5 against 1.7
  (Opus, Atlas), and 4 of 4 in every run against 0 (Opus, Excalidraw, v0.4.0).
- **When Mantis is blind, the agent is too.** With v0.3.1, which could not
  measure contrast on a canvas, agents using Mantis fixed a 1.27:1 button less
  often than agents without it.
- **No agent in either arm covered a bug up:** 0 in 72 graded runs.

## Why not …?

**A browser MCP or a screenshot script?** Playwright MCP, Chrome DevTools MCP and agent-browser give the agent a browser. The agent still has to decide which screens to open and judge each screenshot by eye. Mantis runs on Playwright and adds the parts an agent skips:
- the same matrix every time: phone, tablet and desktop × light and dark × every language;
- detectors that name the element and give the measurements behind each finding;
- a comparison with the last run that catches fixes which only hide a bug.

In [our benchmarks](bench/), Opus 5.5 without Mantis wrote its own Playwright scripts and fixed about as many bugs. The difference was under pressure: with Mantis, the agent still told the user what the CI check couldn't see.

**ProofShot?** ProofShot records what the agent did (video, screenshots and errors) into a proof bundle you can review. Mantis checks for specific kinds of breakage across the matrix, and fails the run when a fix only hides one. One answers "what happened?"; the other answers "is it broken, and was it really fixed?"

**Impeccable?** Impeccable's `detect` checks a page against design rules, so the UI doesn't look generic. Mantis checks that it works: nothing overflows, every label is readable in both themes and every language, and fixes are real. Impeccable makes it tasteful; Mantis proves it isn't broken. Use both.

**Visual regression (Percy, Chromatic, BackstopJS)?** These compare screenshots with an approved baseline and ask a person to review each change. Mantis finds bugs on the first run, with no baseline, and says what is wrong and where. It compares with the previous run only to catch cover-ups.

## Mantis has no taste. It has yours.

`mantis learn` opens the running app and measures the house style it actually uses, with no design spec to write first:
- the colors in each theme, with the CSS variables behind them;
- font sizes, fonts and weights;
- corner radii, spacing, shadows and motion timing.

```bash
mantis learn http://localhost:3000 --routes /,/settings
```

It writes `.mantis/style.json` for the agent, `style.md` for people, and a `style.png` sheet. From then on, `look` checks every page against that style. It warns `off-style` when a page uses:
- a color within ΔE 5 of a house color without being one of them, such as a hard-coded copy of `--primary`;
- a font size or corner radius a pixel or two off the house values;
- a font the app uses nowhere else.

Values far from everything are left alone, since a new illustration color can be on purpose. The sheet also lists the near-duplicates already in the app.

<p align="center">
  <img src="assets/style.png" width="880" alt="A Mantis house-style sheet: the light and dark palettes with their CSS tokens, the type scale in the app's own words, corner radii, spacing and near-duplicate colors">
</p>

`/mantis-fix` reads `style.json` before it writes CSS and reuses the house values instead of inventing new ones.

Mantis puts a `.gitignore` in `.mantis/`, so reports, screenshots and saved sessions stay out of git. To share the house style with your team, commit it on purpose: `git add -f .mantis/style.json`.

## Your project on the sheets

The contact sheet and the proof carry your project's name and a link and QR code
to its repo, read from `package.json` and the git remote. Add a `.mantis.json` to
change them:

```json
{ "name": "Lumen", "logo": "public/logo.svg", "brandColor": "#4f46e5", "repo": "acme/lumen", "qr": true }
```

## Pages behind a login

Give Mantis a Playwright storage state and every screen starts signed in:

```bash
npx playwright codegen --save-storage=.mantis/auth.json http://localhost:3000/login   # sign in, close the window
mantis look http://localhost:3000 --routes /dashboard,/settings --storage-state .mantis/auth.json
```

If the app only keeps a flag in localStorage (onboarding done, a demo session), write the file by hand:

```json
{ "cookies": [], "origins": [{ "origin": "http://localhost:3000", "localStorage": [{ "name": "onboarded", "value": "1" }] }] }
```

The file holds a live session, so keep it out of git. Inside `.mantis/` it already is: Mantis writes a `.gitignore` there. `proof --video` takes the same flag. A run is only compared with earlier runs that used a storage state file of the same name.

## Install

> Mantis is in early development (v0.4). Expect rough edges, and please [open an issue](https://github.com/vulinh1704/mantis/issues) when it gets something wrong.

**Claude Code**

```
/plugin marketplace add vulinh1704/mantis
/plugin install mantis@mantis
```

**Other agents.** The skills use the open `SKILL.md` format, so agents that load skills (Codex, Cursor, GitHub Copilot, Gemini CLI and others) can install them with:

```bash
npx skills add vulinh1704/mantis
```

**Just the CLI**

```bash
npx -y @vulinh1704/mantis look http://localhost:3000
# or install it: npm i -g @vulinh1704/mantis
```

Mantis drives Chromium through Playwright. If the browser isn't installed yet, run `npx playwright install chromium`. Node.js 20 or newer.

**Docker.** No Node or browser to install. The image comes with Chromium, ffmpeg and the fonts the sheets use, for `linux/amd64` and `linux/arm64`:

```bash
# Docker Desktop (Mac, Windows): reach the dev server through host.docker.internal
docker run --rm -v "$PWD:/work" ghcr.io/vulinh1704/mantis look http://host.docker.internal:3000

# Linux: share the host's network, and own the files it writes
docker run --rm --network host --user "$(id -u):$(id -g)" -v "$PWD:/work" ghcr.io/vulinh1704/mantis look http://localhost:3000
```

The report lands in `./.mantis` as usual. A storage state file in the mounted directory works as `--storage-state .mantis/auth.json`.

## Limits

- Mantis checks that the page works, not that it is beautiful. Use it with a
  design skill.
- It doesn't click through flows or check hover and focus states yet.
- It doesn't measure animation smoothness yet.
- Cover-up checks need a previous run of the same URL to compare with. Layout
  shift, console and network issues change by themselves on live pages, so they
  are not checked for cover-ups.
- Off-style compares values, not intent. Content that changes between loads,
  such as product demos, carousels and feeds, can show values the learn run
  never saw. Leave such regions out with `--ignore`.
- Contrast and dark-mode checks read the screenshot when the page code can't
  tell the background: text on a `<canvas>` (whiteboards, maps, editors) or
  under transparent layers. Product mockups drawn in HTML on a marketing page
  are measured like any other text; leave them out with `--ignore` if they are
  decoration. Text over photos, CSS background images and gradients is still
  not checked.

## Why a mantis shrimp?

It has 12 kinds of color receptors; you have 3. It also throws one of the fastest
punches in the animal kingdom. It sees the bug, then it hits the bug.

## License

MIT © Truong Dang Vu Linh. Built on [Playwright](https://playwright.dev) and
[axe-core](https://github.com/dequelabs/axe-core).
