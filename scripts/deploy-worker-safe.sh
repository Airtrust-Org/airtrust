#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
CURRENT_BRANCH="$(git -C "$ROOT_DIR" branch --show-current)"
HEAD_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git -C "$ROOT_DIR" rev-parse origin/main)"

if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "❌ Safe deploy requires branch 'main'. Current: $CURRENT_BRANCH" >&2
  exit 1
fi

if [[ "$HEAD_SHA" != "$ORIGIN_MAIN_SHA" ]]; then
  echo "❌ Safe deploy requires HEAD == origin/main." >&2
  echo "   HEAD:        $HEAD_SHA" >&2
  echo "   origin/main: $ORIGIN_MAIN_SHA" >&2
  exit 1
fi

DEPLOY_VERSION="${APP_VERSION:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")-$(git -C "$ROOT_DIR" rev-parse --short HEAD)}"
BUILD_TIME="${APP_BUILD_TIME:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")}"
TMP_WRANGLER="$(mktemp "$WORKER_DIR/wrangler.safe-deploy.XXXXXX.toml")"

cleanup() {
  rm -f "$TMP_WRANGLER"
}

trap cleanup EXIT

echo "🚀 Worker safe deploy (no migrations)"
echo "   Version: $DEPLOY_VERSION"
echo "   Build time: $BUILD_TIME"

node - "$WORKER_DIR/wrangler.toml" "$TMP_WRANGLER" "$DEPLOY_VERSION" "$BUILD_TIME" <<'NODE'
const fs = require('fs');

const [sourcePath, outputPath, version, buildTime] = process.argv.slice(2);
const source = fs.readFileSync(sourcePath, 'utf8');
let patched = source.replace(/^APP_VERSION = ".*"$/m, `APP_VERSION = "${version}"`);

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
  wrangler deploy --env production --config "$TMP_WRANGLER"
)
