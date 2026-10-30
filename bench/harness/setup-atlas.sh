#!/usr/bin/env bash
# Build a fresh "Atlas" project for one agent run (Windows Git Bash): the fixture, Playwright for
# its check:ui script, optionally the Mantis skills for Claude Code, one commit.
# Usage: setup-atlas.sh <sandbox dir> <with|without>
set -e
SB="$1"
ARM="$2"
FIX="$(cd "$(dirname "$0")/../fixtures/atlas" && pwd)"
MODULES="${TMPDIR:-/tmp}/mantis-bench/atlas-modules"
if [ ! -d "$MODULES/node_modules/playwright" ]; then
  mkdir -p "$MODULES" && cp "$FIX/package.json" "$MODULES/" && (cd "$MODULES" && npm install --no-audit --no-fund > /dev/null 2>&1)
fi
# The untouched check script, used after the run even if the agent edited its own copy.
cp "$FIX/scripts/check-ui.mjs" "$MODULES/check-ui.mjs"
rm -rf "$SB" && mkdir -p "$SB" && cp -r "$FIX"/. "$SB"/
rm -rf "$SB/.mantis"
cp -r "$MODULES/node_modules" "$SB/"
cd "$SB"
if [ "$ARM" = with ]; then
  DO_NOT_TRACK=1 npx -y skills add vulinh1704/mantis --skill '*' --agent claude-code --copy -y > /dev/null 2>&1
  [ -f .claude/skills/mantis-fix/SKILL.md ] || { echo "skills not installed" >&2; exit 1; }
fi
git init -q && git config core.autocrlf false && git add -A && git -c user.name=atlas -c user.email=atlas@example.com commit -qm "Atlas web app"
