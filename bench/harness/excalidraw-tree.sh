#!/usr/bin/env bash
# Make a working copy of the pinned Excalidraw checkout (Windows Git Bash): tracked files only, no
# history, and a real node_modules copied from the shared install, like a developer's checkout.
# The yarn workspace links inside node_modules are re-created to point at this copy's own
# packages, never at the shared (unplanted) source.
#
# node_modules must live inside the copy: Claude Code blocks listing paths outside its working
# directory, so a junction to the shared install hid Playwright from the agent (benchmark 3, v1).
# Usage: excalidraw-tree.sh <dest dir>
set -e
DST="$1"
BASE="${TMPDIR:-/tmp}/mantis-bench/excalidraw-base"
MODULES=(node_modules excalidraw-app/node_modules packages/excalidraw/node_modules packages/fractional-indexing/node_modules packages/utils/node_modules)
LINKS=(@excalidraw/common:packages/common @excalidraw/element:packages/element @excalidraw/excalidraw:packages/excalidraw @excalidraw/fractional-indexing:packages/fractional-indexing @excalidraw/laser-pointer:packages/laser-pointer @excalidraw/math:packages/math @excalidraw/utils:packages/utils excalidraw-app:excalidraw-app with-nextjs:examples/with-nextjs with-script-in-browser:examples/with-script-in-browser)
win() { cygpath -w "$1"; }
unlink_dir() { [ -e "$1" ] || [ -L "$1" ] && powershell -NoProfile -Command "(Get-Item -LiteralPath '$(win "$1")').Delete()" || true; }

# Never let rm walk into another tree: drop every link first, then the copy.
if [ -d "$DST" ]; then
  bash "$(dirname "$0")/excalidraw-serve.sh" --stop
  for m in "${MODULES[@]}"; do [ -L "$DST/$m" ] && unlink_dir "$DST/$m"; done
  for l in "${LINKS[@]}"; do [ -L "$DST/node_modules/${l%%:*}" ] && unlink_dir "$DST/node_modules/${l%%:*}"; done
fi
rm -rf "$DST" && mkdir -p "$DST"
git -C "$BASE" archive HEAD | tar -x -C "$DST"
for m in "${MODULES[@]}"; do
  [ -d "$BASE/$m" ] || continue
  # /XJ skips junctions (the workspace links); robocopy exits 1 when files were copied.
  MSYS_NO_PATHCONV=1 robocopy "$(win "$BASE/$m")" "$(win "$DST/$m")" /E /XJ /MT:16 /NFL /NDL /NJH /NJS /NP > /dev/null || [ $? -lt 8 ]
done
for l in "${LINKS[@]}"; do
  name="${l%%:*}"; target="${l#*:}"
  [ -d "$DST/$target" ] || continue
  mkdir -p "$(dirname "$DST/node_modules/$name")"
  powershell -NoProfile -Command "New-Item -ItemType Junction -Path '$(win "$DST/node_modules/$name")' -Target '$(win "$DST/$target")' | Out-Null"
done
