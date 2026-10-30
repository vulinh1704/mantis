#!/usr/bin/env bash
# Start (or stop) the Excalidraw dev server of a working copy on :3001 (Windows Git Bash).
# Usage: excalidraw-serve.sh <dir> <log file>  |  excalidraw-serve.sh --stop
free3001() {
  for p in $(powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Sort-Object -Unique" | tr -d '\r'); do
    [ "$p" -gt 0 ] 2>/dev/null && taskkill //PID "$p" //T //F > /dev/null 2>&1
  done
  return 0
}
free3001
[ "$1" = --stop ] && exit 0
(cd "$1/excalidraw-app" && BROWSER=none node ../node_modules/vite/bin/vite.js > "$2" 2>&1) &
for t in $(seq 1 90); do curl -sf -o /dev/null http://localhost:3001/ && exit 0; sleep 1; done
echo "dev server did not start" >&2
exit 1
