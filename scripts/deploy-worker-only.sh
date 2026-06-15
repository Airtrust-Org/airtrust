#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
CONFIRM_DEPLOY_TEXT="I understand this deploys the AirTrust production worker"
# DPLY-1: Abort if APP_VERSION is set externally without an explicit override flag.
if [[ -n "${APP_VERSION:-}" && "${AIRTRUST_ALLOW_APP_VERSION_OVERRIDE:-0}" != "1" ]]; then
  echo "❌ APP_VERSION externo detectado: '$APP_VERSION'" >&2
  echo "   Isso pode causar version stamp obsoleto no deploy." >&2
  echo "   Remova a variável ou use AIRTRUST_ALLOW_APP_VERSION_OVERRIDE=1 conscientemente." >&2
  exit 1
fi

echo "⚠️  PRODUCTION WORKER DEPLOY PATH"
echo "   This script is blocked by default and must not be used for routine local validation."
if [[ "${AIRTRUST_ALLOW_PROD_WORKER_DEPLOY:-}" != "YES" ]]; then
  echo "❌ Production worker deploy is blocked by default." >&2
  echo "   Use AIRTRUST_ALLOW_PROD_WORKER_DEPLOY=YES only in an approved deploy window." >&2
  exit 1
fi

if [[ "${AIRTRUST_CONFIRM_PROD_WORKER_DEPLOY:-}" != "$CONFIRM_DEPLOY_TEXT" ]]; then
  echo "❌ Missing explicit confirmation for production worker deploy." >&2
  echo "   Set AIRTRUST_CONFIRM_PROD_WORKER_DEPLOY exactly to:" >&2
  echo "   $CONFIRM_DEPLOY_TEXT" >&2
  exit 1
fi

# Always generate a fresh stamp; accept positional arg $1 as intentional override.
_HEAD_SHORT="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
DEPLOY_VERSION="${1:-$(date -u +"%Y-%m-%dT%H:%M:%SZ")-$_HEAD_SHORT}"
if [[ "${AIRTRUST_ALLOW_APP_VERSION_OVERRIDE:-0}" == "1" && -n "${APP_VERSION:-}" ]]; then
  DEPLOY_VERSION="$APP_VERSION"
fi
BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TMP_WRANGLER="$(mktemp "$WORKER_DIR/wrangler.deploy.XXXXXX.toml")"
CONFIRM_MIGRATIONS_TEXT="I understand this applies production D1 migrations before worker deploy"

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
  # IMPORTANT: Do NOT suppress errors - failed migrations must block deployment.
  # This path is intentionally fail-closed because it touches production D1.
  if [[ "${AIRTRUST_ALLOW_PROD_MIGRATIONS_APPLY:-}" != "YES" ]]; then
    echo "❌ Production migration apply is blocked by default." >&2
    echo "   Use npm run deploy:worker:safe for worker-only deploys without migrations." >&2
    echo "   To apply production migrations here, set AIRTRUST_ALLOW_PROD_MIGRATIONS_APPLY=YES" >&2
    echo "   and AIRTRUST_CONFIRM_PROD_MIGRATIONS_APPLY exactly to:" >&2
    echo "   $CONFIRM_MIGRATIONS_TEXT" >&2
    exit 1
  fi

  if [[ "${AIRTRUST_CONFIRM_PROD_MIGRATIONS_APPLY:-}" != "$CONFIRM_MIGRATIONS_TEXT" ]]; then
    echo "❌ Missing explicit confirmation for production migration apply." >&2
    echo "   Set AIRTRUST_CONFIRM_PROD_MIGRATIONS_APPLY exactly to:" >&2
    echo "   $CONFIRM_MIGRATIONS_TEXT" >&2
    exit 1
  fi

  if ! wrangler d1 migrations apply airtrust-db --env production --remote; then
    echo "❌ FATAL: D1 migration failed. Aborting deployment to prevent schema mismatch." >&2
    exit 1
  fi

  wrangler deploy --env production --config "$TMP_WRANGLER"
)
