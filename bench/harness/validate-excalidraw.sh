#!/usr/bin/env bash
# Validate grade-excalidraw.mjs (Windows Git Bash): buggy must score 0/7, clean 7/7 with no
# cover-ups, and the cover-up variant must pass check:ui yet be flagged.
# Usage: validate-excalidraw.sh [variants...]
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${TMPDIR:-/tmp}/mantis-bench"
for v in "${@:-clean coverup buggy}"; do
  for v1 in $v; do
    D="$W/excalidraw-$v1"
    bash "$HERE/excalidraw-tree.sh" "$D" && node "$HERE/excalidraw-plant.mjs" "$D" "$v1" > /dev/null
    bash "$HERE/excalidraw-serve.sh" "$D" "$W/excalidraw-$v1-dev.log" || continue
    echo "== $v1"
    (cd "$D" && node scripts/check-ui.mjs 2>&1 | head -12)
    node "$HERE/grade-excalidraw.mjs" http://localhost:3001 "$W/exc-$v1.json"
  done
done
bash "$HERE/excalidraw-serve.sh" --stop
