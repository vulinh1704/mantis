#!/usr/bin/env bash
# Validate grade-atlas.mjs (WSL): the buggy fixture must score 0/9, the clean variant 9/9 with no
# cover-ups, and the cover-up variant must be flagged.
# Usage (WSL): validate-atlas.sh
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
FIX="$(cd "$(dirname "$0")/../fixtures/atlas" && pwd)"
for v in buggy clean coverup; do
  D="/tmp/atlas-$v"
  rm -rf "$D" && cp -r "$FIX" "$D"
  [ "$v" = buggy ] || node "$HERE/atlas-variant.mjs" "$D" "$v" > /dev/null
  node ~/projects/mantis/test/helpers/static-server.js "$D" 4363 > /dev/null 2>&1 & s=$!
  sleep 1.2
  echo "== $v"
  node "$HERE/grade-atlas.mjs" http://127.0.0.1:4363 "/tmp/atlas-$v.json" || true
  kill $s; wait $s 2>/dev/null || true
done
