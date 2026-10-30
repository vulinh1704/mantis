#!/usr/bin/env bash
# Mantis with/without benchmark on the Lumen fixture (Windows Git Bash).
#
# The agent is Claude Code (`claude -p`) billed to an API key that the user stores in
# ~/.mantis-bench/anthropic.env as ANTHROPIC_API_KEY=... (never pasted into a chat). Every run gets
# its own CLAUDE_CONFIG_DIR, so the user's own login is never used. Both arms get the same neutral
# prompt and the same tools; WITH has the Mantis skills installed, WITHOUT has none. Each finished
# run is graded by the hidden grader (grade-lumen.mjs, run in WSL), never by Mantis.
#
# Usage: run-bench.sh <runs per arm> <budget usd> [results dir]
set -u
RUNS="${1:-3}"
BUDGET="${2:-40}"
HERE="$(cd "$(dirname "$0")" && pwd)"
RESULTS="${3:-$HERE/../$(date +%Y-%m-%d)}"
KEYFILE="$HOME/.mantis-bench/anthropic.env"
WORK="${TMPDIR:-/tmp}/mantis-bench"
PORT=4351
MODEL="${BENCH_MODEL:-claude-opus-5-5}"
PROMPT='Our marketing site, Lumen, is running at http://localhost:4351 (npm run dev, already started; pages: / and /settings.html). We ship it in English and Vietnamese, with light and dark mode. People say it looks broken on phones and in dark mode. Please find and fix the UI problems. Do not commit.'

# BENCH_DRY=1 checks the plumbing (setup, server, grading, summary) without calling Claude.
# BENCH_AUTH=subscription (default) runs on the owner's Claude Code login; BENCH_AUTH=api uses the key
# file (promotional API credits do not cover Claude Code, so that needs purchased credits).
AUTH="${BENCH_AUTH:-subscription}"
if [ "${BENCH_DRY:-}" != 1 ] && [ "$AUTH" = api ]; then
  [ -f "$KEYFILE" ] || { echo "No API key file. Create $KEYFILE with one line: ANTHROPIC_API_KEY=sk-ant-..." >&2; exit 2; }
  set -a; . "$KEYFILE"; set +a
  [ -n "${ANTHROPIC_API_KEY:-}" ] || { echo "ANTHROPIC_API_KEY is empty in $KEYFILE" >&2; exit 2; }
else
  unset ANTHROPIC_API_KEY
fi
# Both arms: only the project's settings and skills, no personal MCP servers.
ISOLATE=(--setting-sources project --strict-mcp-config)
mkdir -p "$RESULTS" "$WORK"
RESULTS="$(cd "$RESULTS" && pwd)"
SUMMARY="$RESULTS/runs.jsonl"
spent() { [ -f "$SUMMARY" ] && node -e 'let s=0;for(const l of require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n"))if(l)s+=JSON.parse(l).costUsd||0;console.log(s.toFixed(2))' "$SUMMARY" || echo 0; }

for i in $(seq 1 "$RUNS"); do
  for ARM in with without; do
    if node -e "process.exit(Number(process.argv[1]) >= Number(process.argv[2]) ? 0 : 1)" "$(spent)" "$BUDGET"; then
      echo "budget reached (\$$(spent) of \$$BUDGET); stopping"; exit 0
    fi
    ID="$ARM-$i"
    SB="$WORK/$ID/lumen"
    OUT="$RESULTS/$ID"
    mkdir -p "$OUT"
    bash "$HERE/setup-lumen.sh" "$SB" "$ARM" "$PORT" || { echo "$ID: setup failed"; continue; }
    (cd "$SB" && node server.mjs > "$OUT/server.log" 2>&1) &
    SRV=$!
    for t in $(seq 1 40); do curl -sf -o /dev/null "http://localhost:$PORT/" && break; sleep 0.5; done
    START=$(date +%s)
    CONFIG_ENV=()
    if [ "$AUTH" = api ]; then
      # Isolated config that accepts the benchmark API key without a login prompt (not --bare: --bare
      # does not load project skills, which the WITH arm needs).
      mkdir -p "$WORK/$ID/claude-config"
      node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({ hasCompletedOnboarding: true, customApiKeyResponses: { approved: [String(process.env.ANTHROPIC_API_KEY || '').slice(-20)], rejected: [] } }))" "$WORK/$ID/claude-config/.claude.json"
      CONFIG_ENV=(CLAUDE_CONFIG_DIR="$WORK/$ID/claude-config")
    fi
    [ "${BENCH_DRY:-}" = 1 ] && { : > "$OUT/transcript.jsonl"; CODE=0; } || (cd "$SB" && env "${CONFIG_ENV[@]}" DISABLE_AUTOUPDATER=1 claude -p "$PROMPT" --model "$MODEL" "${ISOLATE[@]}" \
      --permission-mode acceptEdits \
      --allowedTools "Bash(npx:*)" "Bash(node:*)" "Bash(npm:*)" "Bash(git:*)" "Bash(ls:*)" "Bash(cat:*)" "Read" "Edit" "Write" "Glob" "Grep" "Skill" \
      --max-turns 120 --output-format stream-json --verbose > "$OUT/transcript.jsonl" 2> "$OUT/stderr.log"; echo $? > "$OUT/claude-exit")
    [ -f "$OUT/claude-exit" ] && CODE=$(cat "$OUT/claude-exit")
    kill "$SRV" 2>/dev/null; wait "$SRV" 2>/dev/null
    (cd "$SB" && git diff --stat > "$OUT/diffstat.txt" && git diff > "$OUT/agent.diff")
    WSB="/mnt/$(cygpath -m "$SB" | sed -E 's#^([A-Za-z]):#\L\1#')"
    WOUT="/mnt/$(cygpath -m "$OUT" | sed -E 's#^([A-Za-z]):#\L\1#')"
    MSYS_NO_PATHCONV=1 wsl -d Ubuntu-24.04 -- bash -lc "node ~/projects/mantis/test/helpers/static-server.js '$WSB' 4363 >/dev/null 2>&1 & s=\$!; sleep 1.5; node ~/projects/mantis/bench/harness/grade-lumen.mjs http://127.0.0.1:4363 '$WOUT/grade.json'; kill \$s" > "$OUT/grade.txt" 2>&1
    node "$HERE/summarize-run.mjs" "$ID" "$ARM" "$CODE" "$(( $(date +%s) - START ))" "$OUT" >> "$SUMMARY"
    tail -n 1 "$SUMMARY"
  done
done
node "$HERE/summarize-run.mjs" --table "$SUMMARY"
