#!/usr/bin/env bash
# ==============================================================================
# deploy-governed-staging.sh — Canonical Governed Staging Release Script
#
# Runs in official CI (CircleCI node:24 docker executor) or authorized local run.
# Deploys Worker (airtrust-api-staging) and Pages (airtrust-staging) with:
# - Target identity guards (strictly refuses production DB/R2/Worker/Pages)
# - Provenance stamping (APP_VERSION, source SHA, bundle hash)
# - Pre-deploy rollback target verification (or bridge baseline bootstrap)
# - Dry-run bundle hash validation
# - Worker provenance endpoint verification (/api/version, /api/health)
# - Stamped frontend build and deployment to airtrust-staging
# - Post-deploy non-mutating smoke tests
# - Fail-closed automatic rollback trap (Worker rollback + Pages forward-rollback)
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

# Target & Identity Constants
export ALLOWED_STAGING_WORKER_NAME="${ALLOWED_STAGING_WORKER_NAME:-airtrust-api-staging}"
export ALLOWED_STAGING_DB_NAME="${ALLOWED_STAGING_DB_NAME:-airtrust-db-staging-baseline-20260701}"
export ALLOWED_STAGING_DB_ID="${ALLOWED_STAGING_DB_ID:-bf9963f4-eb12-439b-a830-20bbf577ac22}"
export ALLOWED_STAGING_BUCKET_NAME="${ALLOWED_STAGING_BUCKET_NAME:-airtrust-storage-staging}"

export BLOCKED_PRODUCTION_DB_ID="${BLOCKED_PRODUCTION_DB_ID:-7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae}"
export BLOCKED_PRODUCTION_WORKER_NAME="${BLOCKED_PRODUCTION_WORKER_NAME:-airtrust-api}"
export BLOCKED_PRODUCTION_BUCKET_NAME="${BLOCKED_PRODUCTION_BUCKET_NAME:-airtrust-storage}"
export BLOCKED_PRODUCTION_HOST="${BLOCKED_PRODUCTION_HOST:-api.airtrust.online}"
export BLOCKED_PRODUCTION_PAGES_PROJECT="${BLOCKED_PRODUCTION_PAGES_PROJECT:-airtrust}"

export PAGES_PROJECT_NAME="${PAGES_PROJECT_NAME:-airtrust-staging}"
export PAGES_STAGING_BRANCH="${PAGES_STAGING_BRANCH:-main}"
export STAGING_PAGES_URL="${STAGING_PAGES_URL:-https://airtrust-staging.pages.dev}"
export STAGING_WORKER_API_URL="${STAGING_WORKER_API_URL:-https://airtrust-api-staging.airtrust.workers.dev/api}"

# Context Resolution
SOURCE_SHA="${AIRTRUST_RELEASE_SHA:-${CIRCLE_SHA1:-${CI_COMMIT_SHA:-$(git rev-parse HEAD)}}}"
SOURCE_TREE="$(git rev-parse "${SOURCE_SHA}^{tree}" 2>/dev/null || git rev-parse HEAD^{tree})"
BUILD_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
APP_VERSION="staging-${BUILD_TIME}-${SOURCE_SHA:0:7}"

echo "========================================================"
echo "AIRTRUST GOVERNED STAGING RELEASE"
echo "Source SHA:      $SOURCE_SHA"
echo "Source Tree:     $SOURCE_TREE"
echo "App Version:     $APP_VERSION"
echo "Target Worker:   $ALLOWED_STAGING_WORKER_NAME"
echo "Target D1 ID:    $ALLOWED_STAGING_DB_ID"
echo "Target Pages:    $PAGES_PROJECT_NAME ($STAGING_PAGES_URL)"
echo "========================================================"

# State tracking files for rollback trap
WORKER_DEPLOYED_FLAG="/tmp/airtrust_worker_deployed_ok"
PAGES_DEPLOYED_FLAG="/tmp/airtrust_pages_deployed_ok"
PRE_WORKER_VERSION_FILE="/tmp/airtrust_pre_worker_version.txt"
PRE_PAGES_SHA_FILE="/tmp/airtrust_pre_pages_sha.txt"
rm -f "$WORKER_DEPLOYED_FLAG" "$PAGES_DEPLOYED_FLAG" "$PRE_WORKER_VERSION_FILE" "$PRE_PAGES_SHA_FILE"

# ------------------------------------------------------------------------------
# Rollback Trap Handler (Fail-Closed)
# ------------------------------------------------------------------------------
rollback_handler() {
  local exit_code=$?
  if [ $exit_code -eq 0 ]; then
    return 0
  fi

  echo "❌ DEPLOY FAILED (exit code $exit_code) — INITIATING GOVERNED ROLLBACK" >&2

  if [ ! -f "$WORKER_DEPLOYED_FLAG" ]; then
    echo "No publish occurred before failure — nothing to roll back." >&2
    exit $exit_code
  fi

  echo "=== ROLLBACK: A. Worker -> pre-deploy Version ID ==="
  PRE_WORKER_ID="$(cat "$PRE_WORKER_VERSION_FILE" 2>/dev/null || echo unavailable)"
  if [ "$PRE_WORKER_ID" != "unavailable" ] && [ -n "$PRE_WORKER_ID" ]; then
    (
      cd worker-airtrust
      npx wrangler rollback "$PRE_WORKER_ID" --env staging --message "auto-rollback: release $SOURCE_SHA failed"
    ) || {
      echo "WORKER ROLLBACK FAILED — target version: $PRE_WORKER_ID" >&2
      echo "ROLLBACK_FAILED" >&2
      exit 1
    }
    echo "Worker successfully rolled back to $PRE_WORKER_ID"
  else
    echo "No pre-deploy Worker version was captured — cannot auto-rollback Worker." >&2
    echo "ROLLBACK_FAILED" >&2
    exit 1
  fi

  if [ ! -f "$PAGES_DEPLOYED_FLAG" ]; then
    echo "Pages had not published yet — Worker rollback is sufficient." >&2
    exit $exit_code
  fi

  echo "=== ROLLBACK: B. Pages -> forward-rollback to previous release ==="
  PRE_PAGES_SHA="$(cat "$PRE_PAGES_SHA_FILE" 2>/dev/null || echo unavailable)"
  if [ "$PRE_PAGES_SHA" = "unavailable" ] || [ -z "$PRE_PAGES_SHA" ]; then
    echo "No pre-deploy Pages source SHA was captured — cannot forward-rollback Pages." >&2
    echo "ROLLBACK_FAILED" >&2
    exit 1
  fi

  ROLLBACK_DIR="$(mktemp -d /tmp/airtrust-pages-rollback-XXXXXX)"
  git worktree add --detach "$ROLLBACK_DIR" "$PRE_PAGES_SHA"
  ACTUAL_SHA="$(git -C "$ROLLBACK_DIR" rev-parse HEAD)"
  if [ "$ACTUAL_SHA" != "$PRE_PAGES_SHA" ]; then
    echo "PAGES FORWARD-ROLLBACK ABORTED: checkout SHA mismatch." >&2
    git worktree remove --force "$ROLLBACK_DIR" 2>/dev/null
    echo "ROLLBACK_FAILED" >&2
    exit 1
  fi

  ROLLBACK_APP_VERSION="rollback-$(date -u +%Y%m%dT%H%M%SZ)-${PRE_PAGES_SHA:0:7}"
  (
    cd "$ROLLBACK_DIR"
    npm ci
    VITE_APP_VERSION="$ROLLBACK_APP_VERSION" \
      VITE_API_URL="$STAGING_WORKER_API_URL" \
      VITE_DEV_PROXY_TARGET="https://airtrust-api-staging.airtrust.workers.dev" \
      APP_VERSION="$ROLLBACK_APP_VERSION" \
      npm run build
    bash scripts/stamp-build-version.sh dist/client/index.html
    npx wrangler pages deploy dist/client \
      --project-name="$PAGES_PROJECT_NAME" \
      --branch="$PAGES_STAGING_BRANCH" \
      --commit-hash="$PRE_PAGES_SHA"
  )
  ROLLBACK_DEPLOY_STATUS=$?
  git worktree remove --force "$ROLLBACK_DIR" 2>/dev/null

  if [ $ROLLBACK_DEPLOY_STATUS -ne 0 ]; then
    echo "PAGES FORWARD-ROLLBACK FAILED during rebuild/redeploy." >&2
    echo "ROLLBACK_FAILED" >&2
    exit 1
  fi

  echo "=== Post-rollback verification ==="
  curl -fsS "$STAGING_WORKER_API_URL/health" >/dev/null || { echo "ROLLBACK_FAILED: worker health failed" >&2; exit 1; }
  curl -fsS "$STAGING_PAGES_URL/" >/dev/null || { echo "ROLLBACK_FAILED: pages health failed" >&2; exit 1; }
  echo "Staging restored to previous release: source_sha=$PRE_PAGES_SHA"
  exit $exit_code
}
trap rollback_handler EXIT

# ------------------------------------------------------------------------------
# 1. Target Identity Guard Assertion
# ------------------------------------------------------------------------------
echo "### 1. Asserting Target Identity Guards ###"
if [ "$PAGES_PROJECT_NAME" = "$BLOCKED_PRODUCTION_PAGES_PROJECT" ]; then
  echo "❌ Refusing deploy: PAGES_PROJECT_NAME must never be '${BLOCKED_PRODUCTION_PAGES_PROJECT}'." >&2
  exit 1
fi

python3 scripts/staging/assert-staging-worker-targets.py \
  --config worker-airtrust/wrangler.toml \
  --allowed-worker-name "$ALLOWED_STAGING_WORKER_NAME" \
  --blocked-production-worker-name "$BLOCKED_PRODUCTION_WORKER_NAME" \
  --allowed-db-name "$ALLOWED_STAGING_DB_NAME" \
  --allowed-db-id "$ALLOWED_STAGING_DB_ID" \
  --blocked-production-db-id "$BLOCKED_PRODUCTION_DB_ID" \
  --allowed-bucket-name "$ALLOWED_STAGING_BUCKET_NAME" \
  --blocked-production-bucket-name "$BLOCKED_PRODUCTION_BUCKET_NAME" \
  --blocked-production-host "$BLOCKED_PRODUCTION_HOST"

# ------------------------------------------------------------------------------
# 2. Capture Pre-Deploy State for Rollback
# ------------------------------------------------------------------------------
echo "### 2. Capturing Pre-Deploy State ###"
PRE_WORKER_VERSION="unavailable"
PRE_WORKER_SHA="unavailable"

DEPLOYMENTS_LOG="$(mktemp)"
if (cd worker-airtrust && npx wrangler deployments list --name "$ALLOWED_STAGING_WORKER_NAME" > "$DEPLOYMENTS_LOG" 2>&1); then
  PRE_WORKER_VERSION="$(node scripts/parse-worker-version-id.mjs "$DEPLOYMENTS_LOG" || echo unavailable)"
fi
rm -f "$DEPLOYMENTS_LOG"

if [ "$PRE_WORKER_VERSION" != "unavailable" ] && [ -n "$PRE_WORKER_VERSION" ]; then
  VERSION_BODY="$(mktemp)"
  if curl -fsS "$STAGING_WORKER_API_URL/version" > "$VERSION_BODY" 2>/dev/null; then
    PRE_WORKER_SHA="$(node -e 'try { console.log(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).sourceSha || "unavailable"); } catch { console.log("unavailable"); }' "$VERSION_BODY")"
  fi
  rm -f "$VERSION_BODY"
fi

echo "pre_deploy_worker_version_id=$PRE_WORKER_VERSION"
echo "pre_deploy_worker_source_sha=$PRE_WORKER_SHA"
echo "$PRE_WORKER_VERSION" > "$PRE_WORKER_VERSION_FILE"

# Pages pre-deploy state
PRE_PAGES_DEPLOYMENT="unavailable"
PRE_PAGES_SHA="unavailable"
if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && [ -n "${CLOUDFLARE_PAGES_API_TOKEN:-}" ]; then
  PAGES_DEPLOYMENTS_JSON="$(curl -fsS \
    -H "Authorization: Bearer ${CLOUDFLARE_PAGES_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PAGES_PROJECT_NAME}/deployments?per_page=10" 2>/dev/null || echo '{"result":[]}')"

  read -r PRE_PAGES_DEPLOYMENT PRE_PAGES_SHA <<< "$(node -e '
    let data = {};
    try { data = JSON.parse(process.argv[1]); } catch (e) {}
    const branch = process.argv[2];
    const deployments = (data.result || []).filter(
      (d) => d.deployment_trigger && d.deployment_trigger.metadata && d.deployment_trigger.metadata.branch === branch,
    );
    deployments.sort((a, b) => new Date(b.created_on) - new Date(a.created_on));
    const top = deployments[0];
    if (!top) { console.log("unavailable unavailable"); process.exit(0); }
    console.log(`${top.id} ${top.deployment_trigger.metadata.commit_hash || "unavailable"}`);
  ' "$PAGES_DEPLOYMENTS_JSON" "$PAGES_STAGING_BRANCH")"
fi

echo "pre_deploy_pages_deployment_id=$PRE_PAGES_DEPLOYMENT"
echo "pre_deploy_pages_source_sha=$PRE_PAGES_SHA"
echo "$PRE_PAGES_SHA" > "$PRE_PAGES_SHA_FILE"

HAS_PREV_RELEASE=true
if [ "$PRE_WORKER_SHA" = "unavailable" ] || [ -z "$PRE_WORKER_SHA" ] || [ "$PRE_PAGES_SHA" = "unavailable" ] || [ -z "$PRE_PAGES_SHA" ]; then
  HAS_PREV_RELEASE=false
fi

if [ "$HAS_PREV_RELEASE" = "true" ]; then
  if [ "$PRE_WORKER_SHA" != "$PRE_PAGES_SHA" ]; then
    echo "Worker and Pages are on different source SHAs (worker=$PRE_WORKER_SHA, pages=$PRE_PAGES_SHA)." >&2
    if [ "${ALLOW_BRIDGE_BASELINE_BOOTSTRAP:-false}" != "true" ]; then
      echo "ABORTING: No coherent previous baseline. Set ALLOW_BRIDGE_BASELINE_BOOTSTRAP=true for initial baseline." >&2
      exit 1
    fi
  else
    echo "Previous release confirmed and recoverable: $PRE_PAGES_SHA"
  fi
else
  if [ "${ALLOW_BRIDGE_BASELINE_BOOTSTRAP:-false}" = "true" ]; then
    echo "BRIDGE_BASELINE_MODE ACTIVE: Establishing initial bridge baseline on current schema (0462)."
  else
    echo "Could not determine previous release and ALLOW_BRIDGE_BASELINE_BOOTSTRAP is false. Aborting." >&2
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# 3. Patch Wrangler Config with Provenance
# ------------------------------------------------------------------------------
echo "### 3. Patching Staging Wrangler Config ###"
cd worker-airtrust
WRANGLER_STAGING_CONFIG="$PWD/wrangler.staging.generated.toml"
node - "$PWD/wrangler.toml" "$WRANGLER_STAGING_CONFIG" "$APP_VERSION" "$BUILD_TIME" <<'NODE'
const fs = require('fs');
const [sourcePath, outputPath, version, buildTime] = process.argv.slice(2);
const source = fs.readFileSync(sourcePath, 'utf8');
const stagingStart = source.indexOf('[env.staging]');
const productionStart = source.indexOf('\n[env.production]', stagingStart);
const before = source.slice(0, stagingStart);
const stagingBlock = source.slice(stagingStart, productionStart);
const after = source.slice(productionStart);
const patchedBlock = stagingBlock
  .replace(/^APP_VERSION = ".*"$/m, `APP_VERSION = "${version}"`)
  .replace(/^APP_BUILD_TIME = ".*"$/m, `APP_BUILD_TIME = "${buildTime}"`);
fs.writeFileSync(outputPath, before + patchedBlock + after);
NODE

# ------------------------------------------------------------------------------
# 4. Dry-run to Compute Bundle Hash
# ------------------------------------------------------------------------------
echo "### 4. Dry-run Deploy to Compute Bundle Hash ###"
BUNDLE_DIR="$(mktemp -d ./.tmp-worker-bundle-XXXXXX)"
npx wrangler deploy --env staging --config wrangler.toml --dry-run --outdir "$BUNDLE_DIR"
BUNDLE_FILE="$(find "$BUNDLE_DIR" -maxdepth 1 -name '*.js' | sort | head -n1)"
if [ -z "$BUNDLE_FILE" ]; then echo "No bundled Worker module found in dry-run." >&2; exit 1; fi
BUNDLE_SHA256="$(sha256sum "$BUNDLE_FILE" | awk '{print $1}')"
echo "worker_bundle_sha256=$BUNDLE_SHA256"
rm -rf "$BUNDLE_DIR"

node ../scripts/lib/patch-wrangler-env-vars.mjs \
  "$WRANGLER_STAGING_CONFIG" "$WRANGLER_STAGING_CONFIG" staging \
  "$APP_VERSION" "$BUILD_TIME" \
  "$(node -e 'console.log(JSON.stringify({AIRTRUST_SOURCE_SHA: process.argv[1], AIRTRUST_SOURCE_TREE: process.argv[2], AIRTRUST_WORKER_BUNDLE_SHA256: process.argv[3]}))' "$SOURCE_SHA" "$SOURCE_TREE" "$BUNDLE_SHA256")"

# ------------------------------------------------------------------------------
# 5. Deploy Worker
# ------------------------------------------------------------------------------
echo "### 5. Deploying Worker (Staging) ###"
REAL_BUNDLE_DIR="$(mktemp -d ./.tmp-worker-bundle-XXXXXX)"
WORKER_DEPLOY_LOG="/tmp/worker-deploy-staging.log"
npx wrangler deploy --env staging --config "$WRANGLER_STAGING_CONFIG" --outdir "$REAL_BUNDLE_DIR" 2>&1 | tee "$WORKER_DEPLOY_LOG"
REAL_BUNDLE_FILE="$(find "$REAL_BUNDLE_DIR" -maxdepth 1 -name '*.js' | sort | head -n1)"
if [ -z "$REAL_BUNDLE_FILE" ]; then echo "No bundled Worker module captured from real deploy." >&2; exit 1; fi
REAL_BUNDLE_SHA256="$(sha256sum "$REAL_BUNDLE_FILE" | awk '{print $1}')"
if [ "$REAL_BUNDLE_SHA256" != "$BUNDLE_SHA256" ]; then
  echo "Bundle hash mismatch: published ($BUNDLE_SHA256) != real deploy ($REAL_BUNDLE_SHA256)" >&2
  exit 1
fi
WORKER_VERSION_ID="$(node ../scripts/parse-worker-version-id.mjs "$WORKER_DEPLOY_LOG" || echo unavailable)"
echo "new_worker_version_id=$WORKER_VERSION_ID"
touch "$WORKER_DEPLOYED_FLAG"
rm -rf "$REAL_BUNDLE_DIR"

# ------------------------------------------------------------------------------
# 6. Verify Worker Provenance Endpoint
# ------------------------------------------------------------------------------
echo "### 6. Verifying Worker Provenance ###"
VERSION_BODY="/tmp/version_body.json"
for i in $(seq 1 6); do
  curl -fsS -o "$VERSION_BODY" "$STAGING_WORKER_API_URL/version" || true
  grep -q "$APP_VERSION" "$VERSION_BODY" 2>/dev/null && break
  sleep 5
done
grep -q "$APP_VERSION" "$VERSION_BODY" || { echo "Provenance mismatch after deploy." >&2; exit 1; }
grep -qE '"environment":"staging"' "$VERSION_BODY" || { echo "Version endpoint did not report environment=staging." >&2; exit 1; }
grep -q "\"sourceSha\":\"$SOURCE_SHA\"" "$VERSION_BODY" || { echo "Source SHA mismatch after deploy." >&2; exit 1; }
echo "Worker provenance verified successfully: $APP_VERSION"

# ------------------------------------------------------------------------------
# 7. Build Frontend and Deploy Pages
# ------------------------------------------------------------------------------
echo "### 7. Building Frontend and Deploying Pages ###"
cd ..
VITE_APP_VERSION="$APP_VERSION" \
  VITE_API_URL="$STAGING_WORKER_API_URL" \
  VITE_DEV_PROXY_TARGET="https://airtrust-api-staging.airtrust.workers.dev" \
  APP_VERSION="$APP_VERSION" APP_BUILD_TIME="$BUILD_TIME" \
  npm run build

bash scripts/stamp-build-version.sh dist/client/index.html

PAGES_DEPLOY_LOG="/tmp/pages-deploy-staging.log"
npx wrangler pages deploy dist/client \
  --project-name="$PAGES_PROJECT_NAME" \
  --branch="$PAGES_STAGING_BRANCH" \
  --commit-hash="$SOURCE_SHA" 2>&1 | tee "$PAGES_DEPLOY_LOG"
touch "$PAGES_DEPLOYED_FLAG"

PAGES_DEPLOYMENT_ID="$(grep -oE 'Deployment complete! Take a peek over at https://[a-zA-Z0-9.-]+' "$PAGES_DEPLOY_LOG" | awk '{print $NF}' || echo "$PAGES_PROJECT_NAME")"

# ------------------------------------------------------------------------------
# 8. Post-Deploy Smoke Verification
# ------------------------------------------------------------------------------
echo "### 8. Running Post-Deploy Smoke Checks ###"
curl -fsS "$STAGING_WORKER_API_URL/health" >/dev/null
curl -fsS "$STAGING_WORKER_API_URL/version" >/dev/null
curl -fsS "$STAGING_PAGES_URL/" >/dev/null
curl -fsS "$STAGING_PAGES_URL/login" >/dev/null

# ------------------------------------------------------------------------------
# 9. Release Summary & Baseline Manifest
# ------------------------------------------------------------------------------
echo "### RELEASE SUMMARY ###"
echo "source_sha=$SOURCE_SHA"
echo "source_tree=$SOURCE_TREE"
echo "app_version=$APP_VERSION"
echo "worker_bundle_sha256=$BUNDLE_SHA256"
echo "new_worker_version_id=$WORKER_VERSION_ID"
echo "schema_compatibility=0462"

if [ "${ALLOW_BRIDGE_BASELINE_BOOTSTRAP:-false}" = "true" ] && [ "$HAS_PREV_RELEASE" != "true" ]; then
  echo "### BRIDGE_BASELINE_ESTABLISHED ###"
  mkdir -p /tmp
  echo "{\"status\":\"BRIDGE_BASELINE_ESTABLISHED\",\"release_sha\":\"$SOURCE_SHA\",\"worker_version_id\":\"$WORKER_VERSION_ID\",\"pages_deployment_id\":\"$PAGES_DEPLOYMENT_ID\",\"schema_compatibility\":\"0462\"}" > /tmp/bridge_baseline_manifest.json
  cat /tmp/bridge_baseline_manifest.json
fi

echo "✅ GOVERNED STAGING RELEASE SUCCESSFUL"
