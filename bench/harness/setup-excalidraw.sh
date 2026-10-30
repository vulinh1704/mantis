#!/usr/bin/env bash
# Build a fresh Excalidraw-fork sandbox for one agent run (Windows Git Bash): the pinned checkout
# without history, the 7 planted bugs, node_modules linked to the shared install, optionally the
# Mantis skills for Claude Code, one commit.
# Usage: setup-excalidraw.sh <sandbox dir> <with|without>
set -e
SB="$1"
ARM="$2"
HERE="$(cd "$(dirname "$0")" && pwd)"
BASE="${TMPDIR:-/tmp}/mantis-bench/excalidraw-base"
FIX="$(cd "$HERE/../fixtures/excalidraw" && pwd)"
# The untouched check script, run after the run even if the agent edited its own copy.
cp "$FIX/check-ui.mjs" "$BASE/check-ui-orig.mjs"
bash "$HERE/excalidraw-tree.sh" "$SB"
node "$HERE/excalidraw-plant.mjs" "$SB" buggy > /dev/null
cd "$SB"
if [ "$ARM" = with ]; then
  DO_NOT_TRACK=1 npx -y skills add vulinh1704/mantis --skill '*' --agent claude-code --copy -y > /dev/null 2>&1
  [ -f .claude/skills/mantis-fix/SKILL.md ] || { echo "skills not installed" >&2; exit 1; }
fi
git init -q && git config core.autocrlf false && git add -A && git -c user.name=dev -c user.email=dev@example.com commit -qm "Excalidraw fork"
