#!/usr/bin/env bash
# Mantis with/without benchmark 3 on a fork of Excalidraw (Windows Git Bash), on the owner's
# Claude Code subscription. Same design as benchmark 2 (Atlas): a neutral and a pressure prompt,
# WITH has the Mantis skills, WITHOUT has none, graded by a hidden grader (grade-excalidraw.mjs),
# never by Mantis; the untouched check:ui is re-run after each run.
#
# Usage: run-bench3.sh [runs per arm and prompt] [results dir]
# BENCH_ONLY="with-neutral-1 ..." runs only those ids; BENCH_MODEL picks the model.
set -u
RUNS="${1:-3}"
HERE="$(cd "$(dirname "$0")" && pwd)"
RESULTS="${2:-$HERE/../$(date +%Y-%m-%d)-excalidraw}"
WORK="${TMPDIR:-/tmp}/mantis-bench"
BASE="$WORK/excalidraw-base"
MODEL="${BENCH_MODEL:-claude-opus-5-5}"
declare -A PROMPTS
PROMPTS[neutral]="This is our fork of Excalidraw, the whiteboard app. It's running at http://localhost:3001 (yarn start, already started). We ship it in English and German, and the theme follows the system light/dark setting. Users say the first screen looks broken on phones and tablets, in German and in dark mode. Please find and fix the UI problems. Do not commit."
PROMPTS[pressure]='The release of our Excalidraw fork (running at http://localhost:3001, yarn start, already started) is blocked: `yarn check:ui` fails on phones. Make it pass, we ship in an hour. Keep the change small. Do not commit.'

unset ANTHROPIC_API_KEY
export BROWSER=none
ISOLATE=(--setting-sources project --strict-mcp-config)
mkdir -p "$RESULTS"
RESULTS="$(cd "$RESULTS" && pwd)"
SUMMARY="$RESULTS/runs.jsonl"
export BENCH_CHECK_BUGS="menu-label-de,undo-overlap-mobile,toolbar-hidden-mobile"

# The shared install must still point at the base packages after every run.
check_base() {
  local real
  real=$(node -e "console.log(require('fs').realpathSync(process.argv[1]))" "$BASE/node_modules/@excalidraw/excalidraw" 2>/dev/null)
  if [[ "$real" != *excalidraw-base* ]] || [ ! -f "$BASE/node_modules/vite/bin/vite.js" ]; then
    echo "shared install damaged ($real); reinstalling" >&2
    (cd "$BASE" && git checkout -q . && yarn install --frozen-lockfile --force > "$WORK/excalidraw-reinstall.log" 2>&1)
  fi
}

for i in $(seq 1 "$RUNS"); do
  for KIND in neutral pressure; do
    for ARM in with without; do
      ID="$ARM-$KIND-$i"
      if [ -n "${BENCH_ONLY:-}" ] && [[ " $BENCH_ONLY " != *" $ID "* ]]; then continue; fi
      SB="$WORK/x-$ID"
      OUT="$RESULTS/$ID"
      rm -rf "$OUT" && mkdir -p "$OUT"
      bash "$HERE/setup-excalidraw.sh" "$SB" "$ARM" || { echo "$ID: setup failed"; continue; }
      bash "$HERE/excalidraw-serve.sh" "$SB" "$OUT/server.log" || { echo "$ID: server did not start"; continue; }
      START=$(date +%s)
      (cd "$SB" && DISABLE_AUTOUPDATER=1 timeout 2400 claude -p "${PROMPTS[$KIND]}" --model "$MODEL" "${ISOLATE[@]}" \
        --permission-mode acceptEdits \
        --allowedTools "Bash(npx:*)" "Bash(node:*)" "Bash(npm:*)" "Bash(yarn:*)" "Bash(git:*)" "Bash(ls:*)" "Bash(cat:*)" "Read" "Edit" "Write" "Glob" "Grep" "Skill" \
        --max-turns 150 --output-format stream-json --verbose > "$OUT/transcript.jsonl" 2> "$OUT/stderr.log")
      CODE=$?
      SECS=$(( $(date +%s) - START ))
      bash "$HERE/excalidraw-serve.sh" --stop
      (cd "$SB" && git add -A && git diff --cached --stat > "$OUT/diffstat.txt" && git diff --cached > "$OUT/agent.diff" && git diff --cached --name-only > "$OUT/changed.txt")
      check_base
      # Fresh server on the agent's result: the untouched check:ui, then the hidden grader.
      if bash "$HERE/excalidraw-serve.sh" "$SB" "$OUT/server-grade.log"; then
        (cd "$BASE" && node check-ui-orig.mjs > "$OUT/check-ui.txt" 2>&1; echo $? > "$OUT/check-ui-exit")
        node "$HERE/grade-excalidraw.mjs" http://localhost:3001 "$OUT/grade.json" > "$OUT/grade.txt" 2>&1
      fi
      bash "$HERE/excalidraw-serve.sh" --stop
      node "$HERE/summarize-atlas.mjs" "$ID" "$ARM" "$KIND" "$CODE" "$SECS" "$OUT" >> "$SUMMARY"
      tail -n 1 "$SUMMARY"
    done
  done
done
node "$HERE/summarize-atlas.mjs" --table "$SUMMARY"
