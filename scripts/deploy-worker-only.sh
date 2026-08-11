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
echo "   This worker-only path never applies D1 migrations."
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
MANIFEST_FILE="$(mktemp)"
PROV_BUNDLE_DIR=""

cleanup() {
  rm -f "$TMP_WRANGLER" "$MANIFEST_FILE"
  [[ -n "$PROV_BUNDLE_DIR" ]] && rm -rf "$PROV_BUNDLE_DIR"
}

trap cleanup EXIT

# Generate + register the full provenance chain (source SHA/tree, worker bundle
# SHA-256, wrangler config SHA-256, release manifest + its SHA-256) and stamp
# every AIRTRUST_* hash into the temp production config that will be deployed.
# See scripts/lib/worker-provenance.sh and docs/ops/PRODUCTION_WORKER_PROVENANCE.md.
# shellcheck source=scripts/lib/worker-provenance.sh
source "$ROOT_DIR/scripts/lib/worker-provenance.sh"
airtrust_generate_worker_provenance \
  "$ROOT_DIR" "$WORKER_DIR" "$WORKER_DIR/wrangler.toml" "$TMP_WRANGLER" \
  "$DEPLOY_VERSION" "$BUILD_TIME" "$MANIFEST_FILE"

# Record the manifest in the CI job log as durable provenance evidence.
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  {
    echo "## Production Worker provenance"
    echo ""
    echo "- APP_VERSION: \`$DEPLOY_VERSION\`"
    echo "- Source SHA: \`$PROV_SOURCE_SHA\`"
    echo "- Source tree: \`$PROV_SOURCE_TREE\`"
    echo "- Worker bundle SHA-256: \`$PROV_WORKER_BUNDLE_SHA256\`"
    echo "- Wrangler config pre-manifest SHA-256: \`$PROV_WRANGLER_CONFIG_PRE_MANIFEST_SHA256\`"
    echo "- Release manifest SHA-256: \`$PROV_RELEASE_MANIFEST_SHA256\`"
    echo "- Wrangler config final SHA-256: \`$PROV_WRANGLER_CONFIG_FINAL_SHA256\`"
  } >> "$GITHUB_STEP_SUMMARY"
fi

# Deliberately no migration command exists in this script. Schema changes are
# separate, explicit, single-change operations under the governed wrappers and
# Schema V2 workflow. A code deploy must never enumerate migrations implicitly.
(
  cd "$WORKER_DIR"
  npx --no-install wrangler deploy --env production --config "$TMP_WRANGLER"
)
