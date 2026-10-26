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

## 3. Optional video (needs ffmpeg)

With both versions running:

```bash
mantis proof --video --before-url http://localhost:3001 --after-url http://localhost:3000
```

If `mantis` isn't installed, use `npx -y @vulinh1704/mantis …`.

## 4. Put it in the PR

Attach the image (and video) with three lines:
1. what was broken;
2. the root cause you fixed;
3. error counts before → after.

Never claim a fix that the after run doesn't show.

## Privacy

Screenshots show whatever is on screen. Use demo or seed data. Don't attach images
that contain real user data, tokens or internal URLs.
