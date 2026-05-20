#!/bin/bash
set -euo pipefail

SCRIPT_PATH="$0"
SCRIPT_DIR="${SCRIPT_PATH%/*}"
if [[ "$SCRIPT_DIR" == "$SCRIPT_PATH" ]]; then
  SCRIPT_DIR='.'
fi

ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_FILE="${1:-$ROOT_DIR/dist/client/index.html}"
STAMPED_VERSION="${APP_VERSION:-$(/usr/bin/git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)}"

if [[ -x /opt/homebrew/opt/node@22/bin/node ]]; then
  NODE_BIN="/opt/homebrew/opt/node@22/bin/node"
elif [[ -x /opt/homebrew/bin/node ]]; then
  NODE_BIN="/opt/homebrew/bin/node"
else
  NODE_BIN="node"
fi

if [[ ! -f "$TARGET_FILE" ]]; then
  echo "Target file not found: $TARGET_FILE" >&2
  exit 1
fi

"$NODE_BIN" - "$TARGET_FILE" "$STAMPED_VERSION" <<'EOF'
const fs = require('fs');

const targetFile = process.argv[2];
const stampedVersion = process.argv[3];
const html = fs.readFileSync(targetFile, 'utf8');

let updatedHtml = html.replace(
  /(<meta\s+name=["']build-version["']\s+content=["'])[^"']*(["']\s*\/?>)/i,
  `$1${stampedVersion}$2`,
);

if (updatedHtml === html) {
  updatedHtml = html.replaceAll('__BUILD_VERSION__', stampedVersion);
}

if (updatedHtml === html) {
  console.log(`Build version already stamped in ${targetFile}`);
  process.exit(0);
}

fs.writeFileSync(targetFile, updatedHtml);
console.log(`Stamped build version ${stampedVersion} in ${targetFile}`);
EOF