<p align="center">
  <img src="assets/mantis.png" width="200" alt="Mantis, a rainbow mantis shrimp wearing boxing gloves">
</p>

<h1 align="center">Mantis</h1>

<p align="center">
  <em>Sees 12 color channels. You see 3. Your coding agent sees 0.</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-111111?style=flat-square" alt="MIT license">
  <img src="https://img.shields.io/badge/skills-SKILL.md-111111?style=flat-square" alt="Agent Skills format">
  <img src="https://img.shields.io/badge/browser-Playwright-111111?style=flat-square" alt="Playwright">
</p>

---

Your coding agent builds UI with its eyes closed. It writes the CSS, says
**"Done ✅"**, and never opens the browser.

Then someone opens the page on a phone:
- the menu runs off the screen;
- in dark mode one card is still white, with white text on it;
- the Vietnamese button label is cut in half.

**Mantis gives the agent eyes.** It:
1. opens the real app;
2. checks every screen size, both themes and every language you ship;
3. boxes what is broken in red;
4. fixes it at the root;
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

## How it works

1. **Look.** `/mantis` runs the app through every screen × theme × language in
   a real browser and writes a report the agent reads, with annotated
   screenshots.
2. **Fix.** `/mantis-fix` fixes causes, not symptoms. It never puts
   `overflow-x: hidden` on the body, shrinks text until it fits, or turns dark
   mode off.
3. **Prove.** `/mantis-proof` makes a before/after sheet, and optionally a
   video, for your pull request.

```bash
mantis look http://localhost:3000 --routes /,/settings --locales en,vi
```

<p align="center">
  <img src="assets/proof.png" width="880" alt="Mantis proof: the same 24 screens before and after the fixes, errors going from 14 to 0">
</p>

## Install

> Mantis is in early development. These commands go live with the first public release.

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
```

Mantis drives Chromium through Playwright. If the browser isn't installed yet, run `npx playwright install chromium`.

## Numbers

These come with the first release. We will run the same agent on the same tasks, with and without Mantis, several times each, on apps with planted UI bugs. We will publish the method, the tasks and the misses, not only the wins.

## Limits

- Mantis checks that the page works, not that it is beautiful. Use it with a
  design skill.
- It doesn't click through flows or check hover and focus states yet.
- It doesn't measure animation smoothness yet.

## Why a mantis shrimp?

It has 12 kinds of color receptors; you have 3. It also throws one of the fastest
punches in the animal kingdom. It sees the bug, then it hits the bug.

## License

MIT © Truong Dang Vu Linh. Built on [Playwright](https://playwright.dev) and
[axe-core](https://github.com/dequelabs/axe-core).
