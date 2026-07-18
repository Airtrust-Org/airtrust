#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
CURRENT_BRANCH="$(git -C "$ROOT_DIR" branch --show-current)"
HEAD_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git -C "$ROOT_DIR" rev-parse origin/main)"
STATUS_OUTPUT="$(git -C "$ROOT_DIR" status --porcelain)"

if [[ -n "$CURRENT_BRANCH" && "$CURRENT_BRANCH" != "main" ]]; then
  echo "❌ Safe deploy requires branch 'main' or detached HEAD at origin/main." >&2
  echo "   Current branch: $CURRENT_BRANCH" >&2
  exit 1
fi

if [[ "$HEAD_SHA" != "$ORIGIN_MAIN_SHA" ]]; then
  echo "❌ Safe deploy requires HEAD == origin/main on clean main or detached HEAD." >&2
  echo "   HEAD:        $HEAD_SHA" >&2
  echo "   origin/main: $ORIGIN_MAIN_SHA" >&2
  exit 1
fi

if [[ -n "$STATUS_OUTPUT" ]]; then
  echo "❌ Safe deploy requires a clean worktree." >&2
  printf '%s\n' "$STATUS_OUTPUT" >&2
  exit 1
fi

# DPLY-1: Abort if APP_VERSION is set externally without an explicit override flag.
# A stale exported APP_VERSION silently stamps deployed code with the wrong hash.
if [[ -n "${APP_VERSION:-}" && "${AIRTRUST_ALLOW_APP_VERSION_OVERRIDE:-0}" != "1" ]]; then
  echo "❌ APP_VERSION externo detectado: '$APP_VERSION'" >&2
  echo "   Isso pode causar version stamp obsoleto no deploy." >&2
  echo "   Remova a variável antes de prosseguir:" >&2
  echo "     unset APP_VERSION && npm run deploy:worker:safe" >&2
  echo "   Ou force override explícito (use com consciência):" >&2
  echo "     AIRTRUST_ALLOW_APP_VERSION_OVERRIDE=1 npm run deploy:worker:safe" >&2
  exit 1
fi

# Always generate a fresh stamp from the current HEAD.
DEPLOY_VERSION="$(date -u +"%Y-%m-%dT%H:%M:%SZ")-$(git -C "$ROOT_DIR" rev-parse --short HEAD)"
# Allow intentional manual stamp only when override is explicitly set.
if [[ "${AIRTRUST_ALLOW_APP_VERSION_OVERRIDE:-0}" == "1" && -n "${APP_VERSION:-}" ]]; then
  DEPLOY_VERSION="$APP_VERSION"
fi
BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TMP_WRANGLER="$(mktemp "$WORKER_DIR/wrangler.safe-deploy.XXXXXX.toml")"

cleanup() {
  rm -f "$TMP_WRANGLER"
}

trap cleanup EXIT

echo "🚀 Worker safe deploy (no migrations)"
echo "   Version: $DEPLOY_VERSION"
echo "   Build time: $BUILD_TIME"
if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "   Ref state: detached HEAD accepted because SHA matches origin/main"
else
  echo "   Ref state: branch $CURRENT_BRANCH"
fi

node "$ROOT_DIR/scripts/lib/patch-wrangler-env-vars.mjs" "$WORKER_DIR/wrangler.toml" "$TMP_WRANGLER" production "$DEPLOY_VERSION" "$BUILD_TIME"
grep -A12 '^\[env.production.vars\]' "$TMP_WRANGLER" | grep -F "APP_VERSION = \"$DEPLOY_VERSION\"" >/dev/null || { echo 'production stamp preflight failed' >&2; exit 1; }

(
  cd "$WORKER_DIR"
  wrangler deploy --env production --config "$TMP_WRANGLER"
)
