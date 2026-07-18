#!/usr/bin/env bash

set -euo pipefail

# Worker-only staging deploy with mandatory provenance stamp.
# Does NOT apply migrations, does NOT deploy Pages, does NOT touch production.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
ALLOWED_STAGING_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
ALLOWED_STAGING_WORKER_NAME="airtrust-api-staging"
VERSION_ENDPOINT="https://airtrust-api-staging.airtrust.workers.dev/api/version"
CONFIRM_TEXT="I understand this deploys the AirTrust staging worker"

CURRENT_BRANCH="$(git -C "$ROOT_DIR" branch --show-current)"
HEAD_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git -C "$ROOT_DIR" rev-parse origin/main)"
STATUS_OUTPUT="$(git -C "$ROOT_DIR" status --porcelain)"
HEAD_SHORT="$(git -C "$ROOT_DIR" rev-parse --short HEAD)"

if [[ "${AIRTRUST_ALLOW_STAGING_WORKER_DEPLOY:-}" != "YES" ]]; then
  echo "❌ Staging worker deploy is blocked by default." >&2
  echo "   Set AIRTRUST_ALLOW_STAGING_WORKER_DEPLOY=YES in an approved staging window." >&2
  exit 1
fi

if [[ "${AIRTRUST_CONFIRM_STAGING_WORKER_DEPLOY:-}" != "$CONFIRM_TEXT" ]]; then
  echo "❌ Missing explicit confirmation for staging worker deploy." >&2
  echo "   Set AIRTRUST_CONFIRM_STAGING_WORKER_DEPLOY exactly to:" >&2
  echo "   $CONFIRM_TEXT" >&2
  exit 1
fi

if [[ -n "$CURRENT_BRANCH" && "$CURRENT_BRANCH" != "main" ]]; then
  echo "❌ Safe staging deploy requires branch 'main' or detached HEAD at origin/main." >&2
  echo "   Current branch: $CURRENT_BRANCH" >&2
  exit 1
fi

if [[ "$HEAD_SHA" != "$ORIGIN_MAIN_SHA" ]]; then
  echo "❌ Safe staging deploy requires HEAD == origin/main." >&2
  echo "   HEAD:        $HEAD_SHA" >&2
  echo "   origin/main: $ORIGIN_MAIN_SHA" >&2
  exit 1
fi

if [[ -n "$STATUS_OUTPUT" ]]; then
  echo "❌ Safe staging deploy requires a clean worktree." >&2
  printf '%s\n' "$STATUS_OUTPUT" >&2
  exit 1
fi

if [[ -n "${APP_VERSION:-}" && "${AIRTRUST_ALLOW_APP_VERSION_OVERRIDE:-0}" != "1" ]]; then
  echo "❌ APP_VERSION externo detectado: '$APP_VERSION'" >&2
  echo "   Remova a variável ou use AIRTRUST_ALLOW_APP_VERSION_OVERRIDE=1 conscientemente." >&2
  exit 1
fi

BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DEPLOY_VERSION="staging-${BUILD_TIME}-${HEAD_SHORT}"
if [[ "${AIRTRUST_ALLOW_APP_VERSION_OVERRIDE:-0}" == "1" && -n "${APP_VERSION:-}" ]]; then
  DEPLOY_VERSION="$APP_VERSION"
fi

# Guard: refuse publishing placeholder / local-only stamps to remote staging.
case "$DEPLOY_VERSION" in
  ""|"dev-local"|"managed-by-script"|"unversioned-remote"|"latest"|"main")
    echo "❌ Refusing to deploy staging with non-auditable APP_VERSION='$DEPLOY_VERSION'" >&2
    exit 1
    ;;
esac

TMP_WRANGLER="$(mktemp "$WORKER_DIR/wrangler.staging-safe.XXXXXX.toml")"

cleanup() {
  rm -f "$TMP_WRANGLER"
}
trap cleanup EXIT

echo "🚀 Staging worker safe deploy (no migrations, no Pages)"
echo "   Version: $DEPLOY_VERSION"
echo "   Build time: $BUILD_TIME"
echo "   HEAD: $HEAD_SHA"

node "$ROOT_DIR/scripts/lib/patch-wrangler-env-vars.mjs" "$WORKER_DIR/wrangler.toml" "$TMP_WRANGLER" staging "$DEPLOY_VERSION" "$BUILD_TIME"
grep -A14 '^\[env.staging.vars\]' "$TMP_WRANGLER" | grep -F "APP_VERSION = \"$DEPLOY_VERSION\"" >/dev/null || { echo 'staging stamp preflight failed' >&2; exit 1; }

if ! grep -q "name = \"$ALLOWED_STAGING_WORKER_NAME\"" "$TMP_WRANGLER"; then
  echo "❌ Staging worker name mismatch in patched config" >&2
  exit 1
fi

if ! grep -q "$ALLOWED_STAGING_DB_ID" "$TMP_WRANGLER"; then
  echo "❌ Staging D1 id mismatch in patched config" >&2
  exit 1
fi

if grep -q 'database_id = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"' "$TMP_WRANGLER" && \
   grep -A2 '\[\[env.staging.d1_databases\]\]' "$TMP_WRANGLER" | grep -q '7c8a788e'; then
  echo "❌ Refusing deploy: staging binding points at production D1" >&2
  exit 1
fi

PREVIOUS_VERSION="$(curl -fsS "$VERSION_ENDPOINT" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' | head -n1 || true)"
echo "   Previous staging version: ${PREVIOUS_VERSION:-unknown}"

(
  cd "$WORKER_DIR"
  wrangler deploy --env staging --config "$TMP_WRANGLER"
)

echo "⏳ Waiting for version endpoint to refresh..."
sleep 3

BODY_FILE="$(mktemp)"
trap 'rm -f "$TMP_WRANGLER" "$BODY_FILE"' EXIT
curl -fsS "$VERSION_ENDPOINT" >"$BODY_FILE"

if grep -qE '"version":"(dev-local|unversioned-remote|managed-by-script|latest|main|)"' "$BODY_FILE"; then
  echo "❌ Staging version provenance failed:" >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

if ! grep -q "\"version\":\"$DEPLOY_VERSION\"" "$BODY_FILE"; then
  echo "❌ Staging version mismatch. Expected $DEPLOY_VERSION" >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

if ! grep -q '"environment":"staging"' "$BODY_FILE"; then
  echo "❌ Staging environment field missing/incorrect" >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

echo "✅ Staging worker deployed with auditable version"
echo "   Deployed: $DEPLOY_VERSION"
echo "   Previous: ${PREVIOUS_VERSION:-unknown}"
echo "   Rollback: redeploy previous SHA with this script from that commit,"
echo "             or restore APP_VERSION via official Deploy Staging workflow."
cat "$BODY_FILE"
printf '\n'
