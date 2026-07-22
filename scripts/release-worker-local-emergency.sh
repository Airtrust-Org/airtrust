#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# CANONICAL_DIR is the expected deployment path for this repository.
# Override via AIRTRUST_CANONICAL_ROOT env var if the repo is in a different location.
CANONICAL_DIR="${AIRTRUST_CANONICAL_ROOT:-/Users/filipedaumas/SAAS/Airtrust}"
CONFIRM_TEXT="AIRTRUST_LOCAL_EMERGENCY_DEPLOY"

echo "LOCAL_DEPLOY_IS_EMERGENCY_ONLY_USE_GITHUB_ACTIONS_BY_DEFAULT"

if [[ "${AIRTRUST_ALLOW_LOCAL_EMERGENCY_DEPLOY:-}" != "YES" ]]; then
  echo "❌ Local production worker deploy is blocked by default." >&2
  echo "   Set AIRTRUST_ALLOW_LOCAL_EMERGENCY_DEPLOY=YES only in an approved incident window." >&2
  exit 1
fi

if [[ "${AIRTRUST_CONFIRM_LOCAL_EMERGENCY_DEPLOY:-}" != "$CONFIRM_TEXT" ]]; then
  echo "❌ Missing explicit emergency confirmation." >&2
  echo "   Set AIRTRUST_CONFIRM_LOCAL_EMERGENCY_DEPLOY exactly to: $CONFIRM_TEXT" >&2
  exit 1
fi

if [[ "$ROOT_DIR" != "$CANONICAL_DIR" ]]; then
  echo "❌ Local emergency deploy requires canonical path." >&2
  echo "   Current:   $ROOT_DIR" >&2
  echo "   Canonical: $CANONICAL_DIR" >&2
  exit 1
fi

CURRENT_BRANCH="$(git -C "$ROOT_DIR" branch --show-current)"
HEAD_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git -C "$ROOT_DIR" rev-parse origin/main)"
STATUS_OUTPUT="$(git -C "$ROOT_DIR" status --porcelain)"

if [[ -n "$CURRENT_BRANCH" && "$CURRENT_BRANCH" != "main" ]]; then
  echo "❌ Local emergency deploy requires branch main or detached HEAD at origin/main." >&2
  echo "   Current branch: $CURRENT_BRANCH" >&2
  exit 1
fi

if [[ "$HEAD_SHA" != "$ORIGIN_MAIN_SHA" ]]; then
  echo "❌ Local emergency deploy requires HEAD == origin/main on clean main or detached HEAD." >&2
  echo "   HEAD:        $HEAD_SHA" >&2
  echo "   origin/main: $ORIGIN_MAIN_SHA" >&2
  exit 1
fi

if [[ -n "$STATUS_OUTPUT" ]]; then
  echo "❌ Local emergency deploy requires a fully clean worktree." >&2
  printf '%s\n' "$STATUS_OUTPUT" >&2
  exit 1
fi

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "❌ Root dependencies missing. Run npm ci first." >&2
  exit 1
fi

if [[ ! -d "$ROOT_DIR/worker-airtrust/node_modules" ]]; then
  echo "❌ worker-airtrust dependencies missing. Run npm --prefix worker-airtrust ci first." >&2
  exit 1
fi

if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "Detached HEAD accepted because SHA matches origin/main."
else
  echo "Branch state: $CURRENT_BRANCH"
fi

eval "$(bash "$ROOT_DIR/scripts/generate-version.sh")"

AIRTRUST_ALLOW_APP_VERSION_OVERRIDE=1 \
APP_VERSION="$APP_VERSION" \
APP_BUILD_TIME="$APP_BUILD_TIME" \
bash "$ROOT_DIR/scripts/deploy-worker-safe.sh"
