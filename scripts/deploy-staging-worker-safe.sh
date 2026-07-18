#!/usr/bin/env bash

set -euo pipefail

# Worker-only staging deploy with mandatory provenance stamp.
# Does NOT apply migrations, does NOT deploy Pages, does NOT touch production.
#
# Provenance chain closed here (2026-07-18 remediation):
#   source commit (HEAD) -> unique bundle dir (mktemp -d, never reused)
#   -> worker bundle SHA-256 -> release manifest -> manifest SHA-256
#   -> injected into the deployed Worker itself (AIRTRUST_* vars), so every
#   response can be traced back to the exact bundle that produced it.
#
# This never claims Cloudflare-side cryptographic proof of runtime content —
# only that the manifest/hashes describe the bundle this script itself built
# and handed to `wrangler deploy`. See docs/ops/STAGING_RUNTIME_FORENSICS_2026-07-18.md
# for the exact evidence classification (pipeline-attested vs proven).

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
SOURCE_TREE="$(git -C "$ROOT_DIR" rev-parse HEAD^{tree})"

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

NODE_VERSION_STRING="$(node --version)"
NPM_VERSION_STRING="$(npm --version)"
WRANGLER_VERSION_STRING="$(cd "$WORKER_DIR" && npx wrangler --version 2>/dev/null | tail -1)"

# Unique, never-reused output dir. A fixed/reusable bundle path is exactly
# what let a stale bundle from an old deploy silently answer later requests
# (2026-07-18 incident: worker-airtrust/.tmp-worker-bundle/ was tracked and
# stale). This directory is created fresh every run and always removed by
# the trap below, even on failure.
BUNDLE_DIR="$(mktemp -d "$WORKER_DIR/.tmp-worker-bundle-XXXXXX")"
TMP_WRANGLER="$(mktemp "$WORKER_DIR/wrangler.staging-safe.XXXXXX.toml")"
MANIFEST_FILE="$(mktemp)"

cleanup() {
  rm -rf "$BUNDLE_DIR"
  rm -f "$TMP_WRANGLER" "$MANIFEST_FILE"
}
trap cleanup EXIT

echo "🚀 Staging worker safe deploy (no migrations, no Pages)"
echo "   Version: $DEPLOY_VERSION"
echo "   Build time: $BUILD_TIME"
echo "   HEAD: $HEAD_SHA"
echo "   Source tree: $SOURCE_TREE"
echo "   Bundle dir: $BUNDLE_DIR"

# 1. Bundle the current HEAD into the fresh, unique directory. This is the
#    exact artifact that will be uploaded in the deploy step below.
(
  cd "$WORKER_DIR"
  wrangler deploy --env staging --config wrangler.toml --dry-run --outdir "$BUNDLE_DIR"
)

WORKER_BUNDLE_FILE="$(find "$BUNDLE_DIR" -maxdepth 1 -name '*.js' | sort | head -n1)"
if [[ -z "$WORKER_BUNDLE_FILE" ]]; then
  echo "❌ No bundled Worker module found in $BUNDLE_DIR" >&2
  exit 1
fi
WORKER_BUNDLE_SHA256="$(shasum -a 256 "$WORKER_BUNDLE_FILE" | awk '{print $1}')"

# 2. Patch a single temporary wrangler config with APP_VERSION/BUILD_TIME and
#    the source-side provenance chain (source SHA/tree, bundle hash). The
#    manifest hash itself is computed afterwards, over the manifest below,
#    then stamped in a second, minimal patch pass so the manifest never has
#    to include its own hash.
node "$ROOT_DIR/scripts/lib/patch-wrangler-env-vars.mjs" "$WORKER_DIR/wrangler.toml" "$TMP_WRANGLER" staging "$DEPLOY_VERSION" "$BUILD_TIME" \
  "$(node -e 'console.log(JSON.stringify({AIRTRUST_SOURCE_SHA: process.argv[1], AIRTRUST_SOURCE_TREE: process.argv[2], AIRTRUST_WORKER_BUNDLE_SHA256: process.argv[3]}))' "$HEAD_SHA" "$SOURCE_TREE" "$WORKER_BUNDLE_SHA256")"

WRANGLER_CONFIG_SHA256="$(shasum -a 256 "$TMP_WRANGLER" | awk '{print $1}')"

cat > "$MANIFEST_FILE" <<JSON
{
  "repository": "airtrustsystem-alt/airtrust",
  "sourceSha": "$HEAD_SHA",
  "sourceTree": "$SOURCE_TREE",
  "environment": "staging",
  "workerBundleSha256": "$WORKER_BUNDLE_SHA256",
  "wranglerConfigSha256": "$WRANGLER_CONFIG_SHA256",
  "nodeVersion": "$NODE_VERSION_STRING",
  "npmVersion": "$NPM_VERSION_STRING",
  "wranglerVersion": "$WRANGLER_VERSION_STRING",
  "buildTimeUtc": "$BUILD_TIME",
  "dirty": false
}
JSON
RELEASE_MANIFEST_SHA256="$(shasum -a 256 "$MANIFEST_FILE" | awk '{print $1}')"

echo "   Worker bundle SHA-256: $WORKER_BUNDLE_SHA256"
echo "   Wrangler config SHA-256: $WRANGLER_CONFIG_SHA256"
echo "   Release manifest SHA-256: $RELEASE_MANIFEST_SHA256"
cat "$MANIFEST_FILE"

# 3. Stamp the manifest hash into the same temp config (second, minimal
#    patch pass — only this one field changes).
node "$ROOT_DIR/scripts/lib/patch-wrangler-env-vars.mjs" "$TMP_WRANGLER" "$TMP_WRANGLER" staging "$DEPLOY_VERSION" "$BUILD_TIME" \
  "$(node -e 'console.log(JSON.stringify({AIRTRUST_RELEASE_MANIFEST_SHA256: process.argv[1]}))' "$RELEASE_MANIFEST_SHA256")"

grep -A20 '^\[env.staging.vars\]' "$TMP_WRANGLER" | grep -F "APP_VERSION = \"$DEPLOY_VERSION\"" >/dev/null || { echo 'staging stamp preflight failed' >&2; exit 1; }
grep -A20 '^\[env.staging.vars\]' "$TMP_WRANGLER" | grep -F "AIRTRUST_SOURCE_SHA = \"$HEAD_SHA\"" >/dev/null || { echo 'source SHA stamp preflight failed' >&2; exit 1; }
grep -A20 '^\[env.staging.vars\]' "$TMP_WRANGLER" | grep -F "AIRTRUST_WORKER_BUNDLE_SHA256 = \"$WORKER_BUNDLE_SHA256\"" >/dev/null || { echo 'bundle hash stamp preflight failed' >&2; exit 1; }
grep -A20 '^\[env.staging.vars\]' "$TMP_WRANGLER" | grep -F "AIRTRUST_RELEASE_MANIFEST_SHA256 = \"$RELEASE_MANIFEST_SHA256\"" >/dev/null || { echo 'manifest hash stamp preflight failed' >&2; exit 1; }

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

# 4. Real deploy. Reuses the same TMP_WRANGLER config used to compute the
#    hashes above — the config that gets hashed is the config that gets
#    deployed, not a separately-generated copy. Also captures the bundle
#    esbuild actually produced for THIS deploy (via --outdir alongside the
#    real, non-dry-run deploy) and compares its hash to the earlier dry-run
#    hash we already published in the vars. This is DETECTION, not
#    prevention: the vars (including the published hash) were already
#    uploaded by the time this comparison runs, so a mismatch here means
#    "this deploy's published hash is unverified/wrong, treat it as
#    suspect and redeploy or roll back" — not "the bad value never shipped".
#    A guarantee would require bundling once, hashing, then deploying a
#    second time with the verified hash; not done here to avoid a double
#    network deploy on every release.
REAL_BUNDLE_DIR="$(mktemp -d "$WORKER_DIR/.tmp-worker-bundle-XXXXXX")"
cleanup() {
  rm -rf "$BUNDLE_DIR" "$REAL_BUNDLE_DIR"
  rm -f "$TMP_WRANGLER" "$MANIFEST_FILE"
}
trap cleanup EXIT
(
  cd "$WORKER_DIR"
  wrangler deploy --env staging --config "$TMP_WRANGLER" --outdir "$REAL_BUNDLE_DIR"
)

REAL_BUNDLE_FILE="$(find "$REAL_BUNDLE_DIR" -maxdepth 1 -name '*.js' | sort | head -n1)"
if [[ -z "$REAL_BUNDLE_FILE" ]]; then
  echo "❌ No bundled Worker module captured from the real deploy in $REAL_BUNDLE_DIR" >&2
  exit 1
fi
REAL_BUNDLE_SHA256="$(shasum -a 256 "$REAL_BUNDLE_FILE" | awk '{print $1}')"
if [[ "$REAL_BUNDLE_SHA256" != "$WORKER_BUNDLE_SHA256" ]]; then
  echo "❌ Bundle hash mismatch: dry-run bundle ($WORKER_BUNDLE_SHA256) != real deploy bundle ($REAL_BUNDLE_SHA256)" >&2
  echo "   The published AIRTRUST_WORKER_BUNDLE_SHA256 does not describe what was actually deployed. Aborting." >&2
  exit 1
fi
echo "   Real deploy bundle hash matches published hash: $REAL_BUNDLE_SHA256"

echo "⏳ Waiting for version endpoint to refresh..."
sleep 3

BODY_FILE="$(mktemp)"
trap 'cleanup; rm -f "$BODY_FILE"' EXIT
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

if ! grep -q "\"sourceSha\":\"$HEAD_SHA\"" "$BODY_FILE"; then
  echo "❌ Staging source SHA mismatch in /api/version response" >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

if ! grep -q "\"workerBundleSha256\":\"$WORKER_BUNDLE_SHA256\"" "$BODY_FILE"; then
  echo "❌ Staging worker bundle hash mismatch in /api/version response" >&2
  cat "$BODY_FILE" >&2
  exit 1
fi

echo "✅ Staging worker deployed with auditable version and closed provenance chain"
echo "   Deployed: $DEPLOY_VERSION"
echo "   Previous: ${PREVIOUS_VERSION:-unknown}"
echo "   Source SHA: $HEAD_SHA"
echo "   Worker bundle SHA-256: $WORKER_BUNDLE_SHA256"
echo "   Release manifest SHA-256: $RELEASE_MANIFEST_SHA256"
echo "   Rollback: redeploy previous SHA with this script from that commit,"
echo "             or restore APP_VERSION via official Deploy Staging workflow."
cat "$BODY_FILE"
printf '\n'
