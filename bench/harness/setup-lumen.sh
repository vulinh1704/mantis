#!/usr/bin/env bash
# Build a clean "Lumen" project from Mantis's buggy-app fixture for an agent run (Windows Git Bash):
# no PLANTED hints, a tiny dev server on $PORT, optionally the Mantis skills for Claude Code, one commit.
# Usage: setup-lumen.sh <sandbox dir> <with|without> [port]
set -e
SB="$1"
ARM="$2"
PORT="${3:-4351}"
SRC="$(cd "$(dirname "$0")/../../fixtures/buggy-app" && pwd)"
rm -rf "$SB" && mkdir -p "$SB" && cp -r "$SRC"/. "$SB"/
cd "$SB"
rm -f PLANTED.json
node -e '
const fs = require("fs"), path = require("path");
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(".").filter((f) => /\.(css|js|html)$/.test(f))) {
  let t = fs.readFileSync(f, "utf8");
  t = t.replace(/\/\*[\s\S]*?\*\//g, (m) => (/PLANTED|bug/i.test(m) ? "" : m));
  t = t.replace(/<!--[\s\S]*?-->/g, (m) => (/PLANTED|bug/i.test(m) ? "" : m));
  t = t.replace(/^[ \t]*\/\/.*(PLANTED|bug).*$/gim, "");
  fs.writeFileSync(f, t);
}'
if grep -rqiE 'planted|\bbug' --include='*.css' --include='*.js' --include='*.html' . ; then echo "hints left" >&2; exit 1; fi
cat > server.mjs <<EOF
// Lumen dev server: serves this folder on http://localhost:$PORT
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };
const root = path.resolve('.');
createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen($PORT, () => console.log('Lumen on http://localhost:$PORT'));
EOF
printf '{\n  "name": "lumen-site",\n  "private": true,\n  "type": "module",\n  "scripts": { "dev": "node server.mjs" }\n}\n' > package.json
printf 'node_modules/\n.mantis/\n' > .gitignore
if [ "$ARM" = with ]; then
  DO_NOT_TRACK=1 npx -y skills add vulinh1704/mantis --skill '*' --agent claude-code --copy -y > /dev/null 2>&1
  [ -f .claude/skills/mantis-fix/SKILL.md ] || { echo "skills not installed" >&2; exit 1; }
fi
git init -q && git add -A && git -c core.autocrlf=false -c user.name=lumen -c user.email=lumen@example.com commit -qm "Lumen marketing site"
