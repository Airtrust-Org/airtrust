#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
DEPLOY_VERSION="${APP_VERSION:-${1:-$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)}}"
BUILD_TIME="${APP_BUILD_TIME:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
TMP_WRANGLER="$(mktemp "$WORKER_DIR/wrangler.deploy.XXXXXX.toml")"

cleanup() {
  rm -f "$TMP_WRANGLER"
}

trap cleanup EXIT

node - "$WORKER_DIR/wrangler.toml" "$TMP_WRANGLER" "$DEPLOY_VERSION" "$BUILD_TIME" <<'NODE'
const fs = require('fs');

const [sourcePath, outputPath, version, buildTime] = process.argv.slice(2);
const source = fs.readFileSync(sourcePath, 'utf8');
let patched = source.replace(
  /^APP_VERSION = ".*"$/m,
  `APP_VERSION = "${version}"`,
);

if (patched === source) {
  console.error('APP_VERSION entry not found in wrangler.toml');
  process.exit(1);
}

if (/^APP_BUILD_TIME = ".*"$/m.test(patched)) {
  patched = patched.replace(/^APP_BUILD_TIME = ".*"$/m, `APP_BUILD_TIME = "${buildTime}"`);
} else {
  patched = patched.replace(
    /^APP_VERSION = ".*"$/m,
    `APP_VERSION = "${version}"\nAPP_BUILD_TIME = "${buildTime}"`,
  );
}

fs.writeFileSync(outputPath, patched);
NODE

(
  cd "$WORKER_DIR"
  # Apply pending D1 migrations before deploying the worker
  # IMPORTANT: Do NOT suppress errors - failed migrations must block deployment
  if ! wrangler d1 migrations apply airtrust-db --env production --remote; then
    echo "❌ FATAL: D1 migration failed. Aborting deployment to prevent schema mismatch." >&2
    exit 1
  fi
  wrangler deploy --env production --config "$TMP_WRANGLER"
)