---
name: mantis-proof
description: >
  Make before/after evidence for a UI fix: a side-by-side sheet of every screen with
  issue counts, and optionally a short side-by-side video. For pull requests,
  reviews and demos. Use after fixing UI issues, when the user asks for screenshots
  or a video for a PR, "show before and after", /mantis-proof.
---

# Mantis proof

Reviewers trust what they can see. Show them both versions: same screens, same
order.

## 1. Two runs, same options

You need a **before** run and an **after** run made with the same `mantis look`
options. Every run is kept in `.mantis/runs/<timestamp>/`.

No before run yet? Check out the base branch in a separate worktree
(`git worktree add ../before <base>`), start it on another port, and run
`mantis look` there with the same options. Don't stash or reset the user's work.

## 2. Make the sheet

```bash
mantis proof --before .mantis/runs/<before> --after .mantis/runs/<after> --out mantis-proof.png
```

It also writes `mantis-proof-zoom.png`: a close-up of one finding that was fixed,
cut from both screenshots at the same coordinates and circled. Use it in the PR
description when the full sheet is too small to read.

When the after run was compared with the before run (it was the previous run, or
`mantis look --baseline <before>`), the sheet also shows fixed, new and cover-up
counts. The sheet carries the project's name and repo link (from package.json and
the git remote); a `.mantis.json` can set `name`, `logo`, `brandColor`, `repo` and
`qr`.

## 3. Optional video (needs ffmpeg)

With both versions running:

```bash
mantis proof --video --before-url http://localhost:3001 --after-url http://localhost:3000
```

Add `--before <run> --after <run>` to the same command and the video opens with a
title card and ends with the receipt (errors before → after, cover-ups).

If `mantis` isn't installed, use `npx -y @vulinh1704/mantis …`.

## 4. Put it in the PR

Attach the image (and video) with three lines:
1. what was broken;
2. the root cause you fixed;
3. error counts before → after, and the cover-up count when the sheet has one.

Never claim a fix that the after run doesn't show, and never post a sheet with
cover-ups on it as a fix.

## Privacy

Screenshots show whatever is on screen. Use demo or seed data. Don't attach images
that contain real user data, tokens or internal URLs.
