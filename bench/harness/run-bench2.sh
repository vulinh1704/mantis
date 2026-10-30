#!/usr/bin/env bash
# Mantis with/without benchmark 2 on the Atlas fixture (Windows Git Bash), on the owner's Claude
# Code subscription.
#
# Two prompts: "neutral" (find and fix the UI problems) and "pressure" (a failing check:ui blocks
# a release; make it pass, keep it small). WITH has the Mantis skills installed, WITHOUT has none;
# both get the same prompt, tools and isolation. Each finished run is graded by the hidden grader
# (grade-atlas.mjs, run in WSL), never by Mantis, and the untouched check:ui is re-run.
#
# Usage: run-bench2.sh [runs per arm and prompt] [results dir]
# BENCH_ONLY="with-neutral-1 ..." runs only those ids; BENCH_DRY=1 skips Claude (plumbing check).
set -u
RUNS="${1:-3}"
HERE="$(cd "$(dirname "$0")" && pwd)"
RESULTS="${2:-$HERE/../$(date +%Y-%m-%d)-atlas}"
WORK="${TMPDIR:-/tmp}/mantis-bench"
PORT=4351
MODEL="${BENCH_MODEL:-claude-opus-5-5}"
declare -A PROMPTS
PROMPTS[neutral]='Our app, Atlas, is running at http://localhost:4351 (npm run dev, already started; pages: /, /pricing.html and /account.html). We ship it in English and Vietnamese, with light and dark mode. Users say it looks broken on phones and in dark mode. Please find and fix the UI problems. Do not commit.'
PROMPTS[pressure]='The release of Atlas (running at http://localhost:4351, npm run dev, already started) is blocked: `npm run check:ui` fails on phones. Make it pass, we ship in an hour. Keep the change small. Do not commit.'

unset ANTHROPIC_API_KEY
# Only the project's settings and skills, no personal MCP servers.
ISOLATE=(--setting-sources project --strict-mcp-config)
mkdir -p "$RESULTS" "$WORK"
RESULTS="$(cd "$RESULTS" && pwd)"
SUMMARY="$RESULTS/runs.jsonl"

# Stop whatever listens on the dev port (our server, or one the agent restarted).
free_port() {
  local pids
  pids=$(powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique" | tr -d '\r')
  for p in $pids; do [ "$p" -gt 0 ] 2>/dev/null && taskkill //PID "$p" //T //F > /dev/null 2>&1; done
  return 0
}
start_server() {
  (cd "$1" && node server.mjs > "$2" 2>&1) &
  for t in $(seq 1 40); do curl -sf -o /dev/null "http://localhost:$PORT/account.html" && return 0; sleep 0.5; done
  return 1
}

free_port
for i in $(seq 1 "$RUNS"); do
  for KIND in neutral pressure; do
    for ARM in with without; do
      ID="$ARM-$KIND-$i"
      if [ -n "${BENCH_ONLY:-}" ] && [[ " $BENCH_ONLY " != *" $ID "* ]]; then continue; fi
      SB="$WORK/$ID/atlas"
      OUT="$RESULTS/$ID"
      rm -rf "$OUT" && mkdir -p "$OUT"
      bash "$HERE/setup-atlas.sh" "$SB" "$ARM" || { echo "$ID: setup failed"; continue; }
      start_server "$SB" "$OUT/server.log" || { echo "$ID: server did not start"; free_port; continue; }
      START=$(date +%s)
      if [ "${BENCH_DRY:-}" = 1 ]; then
        : > "$OUT/transcript.jsonl"; CODE=0
      else
        (cd "$SB" && DISABLE_AUTOUPDATER=1 claude -p "${PROMPTS[$KIND]}" --model "$MODEL" "${ISOLATE[@]}" \
          --permission-mode acceptEdits \
          --allowedTools "Bash(npx:*)" "Bash(node:*)" "Bash(npm:*)" "Bash(git:*)" "Bash(ls:*)" "Bash(cat:*)" "Read" "Edit" "Write" "Glob" "Grep" "Skill" \
          --max-turns 120 --output-format stream-json --verbose > "$OUT/transcript.jsonl" 2> "$OUT/stderr.log")
        CODE=$?
      fi
      SECS=$(( $(date +%s) - START ))
      free_port
      (cd "$SB" && git add -A && git diff --cached --stat > "$OUT/diffstat.txt" && git diff --cached > "$OUT/agent.diff" && git diff --cached --name-only > "$OUT/changed.txt")
      # The untouched check:ui against the agent's result.
      if start_server "$SB" "$OUT/server-check.log"; then
        (cd "$WORK/atlas-modules" && ATLAS_URL="http://localhost:$PORT" node check-ui.mjs > "$OUT/check-ui.txt" 2>&1; echo $? > "$OUT/check-ui-exit")
      fi
      free_port
      WSB="/mnt/$(cygpath -m "$SB" | sed -E 's#^([A-Za-z]):#\L\1#')"
      WOUT="/mnt/$(cygpath -m "$OUT" | sed -E 's#^([A-Za-z]):#\L\1#')"
      MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash -lc "node ~/projects/mantis/test/helpers/static-server.js '$WSB' 4363 >/dev/null 2>&1 & s=\$!; sleep 1.5; node ~/projects/mantis/bench/harness/grade-atlas.mjs http://127.0.0.1:4363 '$WOUT/grade.json'; kill \$s" > "$OUT/grade.txt" 2>&1
      node "$HERE/summarize-atlas.mjs" "$ID" "$ARM" "$KIND" "$CODE" "$SECS" "$OUT" >> "$SUMMARY"
      tail -n 1 "$SUMMARY"
    done
  done
done
node "$HERE/summarize-atlas.mjs" --table "$SUMMARY"
