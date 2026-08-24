#!/usr/bin/env bash
# shellcheck shell=bash
#
# Shared provenance generator for the PRODUCTION Worker-only deploy path.
# Sourced by scripts/deploy-worker-only.sh and scripts/deploy-worker-safe.sh.
#
# It produces the same closed provenance chain the staging path already ships
# (see scripts/deploy-staging-worker-safe.sh), so production responses can be
# traced back to the exact bundle that produced them:
#
#   source commit (HEAD) + source tree
#     -> fresh, never-reused bundle dir (mktemp -d)
#     -> Worker bundle SHA-256 (over the esbuild bundle wrangler produced)
#     -> wrangler config SHA-256 (over the exact config handed to wrangler)
#     -> release manifest (JSON) aggregating all of the above
#     -> release manifest SHA-256
#   all four AIRTRUST_* hashes are stamped into the deployed Worker's own
#   env.production.vars, so GET /api/version and every response header can
#   echo them back.
#
# HONESTY: this is "pipeline-attested" evidence. It attests to what THIS
# pipeline built and hashed locally. It is NOT an independent re-hash of what
# Cloudflare stored/served — Cloudflare does not expose a publicly verifiable
# content hash of the deployed Worker in this setup. See
# docs/ops/PRODUCTION_WORKER_PROVENANCE.md for the full classification and the
# documented `wrangler deploy --dry-run` Worker-Version-ID limitation.
#
# Usage:
#   airtrust_generate_worker_provenance \
#       "$ROOT_DIR" "$WORKER_DIR" "$BASE_CONFIG" "$OUT_TMP_WRANGLER" \
#       "$DEPLOY_VERSION" "$BUILD_TIME" "$MANIFEST_OUT"
#
# On success it sets these globals for the caller:
#   PROV_SOURCE_SHA PROV_SOURCE_TREE PROV_WORKER_BUNDLE_SHA256
#   PROV_WRANGLER_CONFIG_PRE_MANIFEST_SHA256 PROV_RELEASE_MANIFEST_SHA256
#   PROV_WRANGLER_CONFIG_FINAL_SHA256
#   PROV_BUNDLE_DIR (the mktemp -d dir; caller is responsible for cleanup)
#
# The caller MUST arrange cleanup of PROV_BUNDLE_DIR (rm -rf) in its own trap.

airtrust_generate_worker_provenance() {
  local root_dir="$1" worker_dir="$2" base_config="$3" out_tmp_wrangler="$4"
  local deploy_version="$5" build_time="$6" manifest_out="$7"
  local environment="production"

  local source_sha source_tree
  source_sha="$(git -C "$root_dir" rev-parse HEAD)"
  source_tree="$(git -C "$root_dir" rev-parse HEAD^{tree})"

  # Refuse to stamp a floating / non-auditable APP_VERSION into production.
  case "$deploy_version" in
    ""|"dev-local"|"managed-by-script"|"unversioned-remote"|"latest"|"main")
      echo "❌ Refusing production provenance with non-auditable APP_VERSION='$deploy_version'" >&2
      return 1
      ;;
  esac

  local node_version npm_version wrangler_version
  node_version="$(node --version)"
  npm_version="$(npm --version)"
  wrangler_version="$(cd "$worker_dir" && npx --no-install wrangler --version 2>/dev/null | tail -1)"

  # 1. Bundle current HEAD into a fresh, unique dir. A fixed/reusable outdir is
  #    exactly what let a stale bundle silently answer later requests
  #    (2026-07-18 incident). This dir is created fresh every run.
  PROV_BUNDLE_DIR="$(mktemp -d "$worker_dir/.tmp-worker-bundle-XXXXXX")"
  (
    cd "$worker_dir"
    npx --no-install wrangler deploy --env "$environment" --config "$base_config" --dry-run --outdir "$PROV_BUNDLE_DIR"
  )

  local bundle_file
  bundle_file="$(find "$PROV_BUNDLE_DIR" -maxdepth 1 -name '*.js' | sort | head -n1)"
  if [[ -z "$bundle_file" ]]; then
    echo "❌ No bundled Worker module found in $PROV_BUNDLE_DIR" >&2
    return 1
  fi
  PROV_WORKER_BUNDLE_SHA256="$(shasum -a 256 "$bundle_file" | awk '{print $1}')"

  # 2. First patch pass: source SHA/tree + bundle hash into the temp config.
  node "$root_dir/scripts/lib/patch-wrangler-env-vars.mjs" \
    "$base_config" "$out_tmp_wrangler" "$environment" "$deploy_version" "$build_time" \
    "$(node -e 'console.log(JSON.stringify({AIRTRUST_SOURCE_SHA: process.argv[1], AIRTRUST_SOURCE_TREE: process.argv[2], AIRTRUST_WORKER_BUNDLE_SHA256: process.argv[3]}))' "$source_sha" "$source_tree" "$PROV_WORKER_BUNDLE_SHA256")"

  # 3. Hash the config that will actually be deployed (with source+bundle vars,
  #    before the manifest hash is added). Same ordering as staging.
  PROV_WRANGLER_CONFIG_PRE_MANIFEST_SHA256="$(shasum -a 256 "$out_tmp_wrangler" | awk '{print $1}')"

  # 4. Build the deterministic manifest + its SHA-256 via the shared node module.
  local fields_json manifest_sha_line
  fields_json="$(node -e 'console.log(JSON.stringify({
      repository: "Airtrust-Org/airtrust",
      environment: process.argv[1],
      appVersion: process.argv[2],
      sourceSha: process.argv[3],
      sourceTree: process.argv[4],
      workerBundleSha256: process.argv[5],
      wranglerConfigPreManifestSha256: process.argv[6],
      nodeVersion: process.argv[7],
      npmVersion: process.argv[8],
      wranglerVersion: process.argv[9],
      buildTimeUtc: process.argv[10],
      workerVersionId: null,
      dirty: false
    }))' \
    "$environment" "$deploy_version" "$source_sha" "$source_tree" \
    "$PROV_WORKER_BUNDLE_SHA256" "$PROV_WRANGLER_CONFIG_PRE_MANIFEST_SHA256" \
    "$node_version" "$npm_version" "$wrangler_version" "$build_time")"

  manifest_sha_line="$(node "$root_dir/scripts/lib/build-release-manifest.mjs" "$fields_json" "$manifest_out" | grep '^RELEASE_MANIFEST_SHA256=')"
  PROV_RELEASE_MANIFEST_SHA256="${manifest_sha_line#RELEASE_MANIFEST_SHA256=}"
  if [[ -z "$PROV_RELEASE_MANIFEST_SHA256" ]]; then
    echo "❌ Failed to compute release manifest SHA-256" >&2
    return 1
  fi

  # 5. Second (minimal) patch pass: manifest hash into the same temp config.
  node "$root_dir/scripts/lib/patch-wrangler-env-vars.mjs" \
    "$out_tmp_wrangler" "$out_tmp_wrangler" "$environment" "$deploy_version" "$build_time" \
    "$(node -e 'console.log(JSON.stringify({AIRTRUST_RELEASE_MANIFEST_SHA256: process.argv[1]}))' "$PROV_RELEASE_MANIFEST_SHA256")"

  PROV_WRANGLER_CONFIG_FINAL_SHA256="$(shasum -a 256 "$out_tmp_wrangler" | awk '{print $1}')"

  # 6. Preflight: every stamp must be present in the config we are about to deploy.
  local section
  section="$(grep -A24 '^\[env.production.vars\]' "$out_tmp_wrangler")"
  printf '%s' "$section" | grep -F "APP_VERSION = \"$deploy_version\"" >/dev/null || { echo 'production APP_VERSION stamp preflight failed' >&2; return 1; }
  printf '%s' "$section" | grep -F "APP_BUILD_TIME = \"$build_time\"" >/dev/null || { echo 'production APP_BUILD_TIME stamp preflight failed' >&2; return 1; }
  printf '%s' "$section" | grep -F "AIRTRUST_SOURCE_SHA = \"$source_sha\"" >/dev/null || { echo 'source SHA stamp preflight failed' >&2; return 1; }
  printf '%s' "$section" | grep -F "AIRTRUST_SOURCE_TREE = \"$source_tree\"" >/dev/null || { echo 'source tree stamp preflight failed' >&2; return 1; }
  printf '%s' "$section" | grep -F "AIRTRUST_WORKER_BUNDLE_SHA256 = \"$PROV_WORKER_BUNDLE_SHA256\"" >/dev/null || { echo 'bundle hash stamp preflight failed' >&2; return 1; }
  printf '%s' "$section" | grep -F "AIRTRUST_RELEASE_MANIFEST_SHA256 = \"$PROV_RELEASE_MANIFEST_SHA256\"" >/dev/null || { echo 'manifest hash stamp preflight failed' >&2; return 1; }

  # 7. Guard: never let the production binding be swapped for staging/dev D1.
  if ! grep -q 'database_id = "7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"' "$out_tmp_wrangler"; then
    echo "❌ Production D1 id missing/altered in patched config — refusing" >&2
    return 1
  fi

  PROV_SOURCE_SHA="$source_sha"
  PROV_SOURCE_TREE="$source_tree"

  echo "🔗 Production provenance chain generated:"
  echo "   Source SHA:                               $PROV_SOURCE_SHA"
  echo "   Source tree:                              $PROV_SOURCE_TREE"
  echo "   Worker bundle SHA-256:                    $PROV_WORKER_BUNDLE_SHA256"
  echo "   Wrangler config pre-manifest SHA-256:     $PROV_WRANGLER_CONFIG_PRE_MANIFEST_SHA256"
  echo "   Release manifest SHA-256:                 $PROV_RELEASE_MANIFEST_SHA256"
  echo "   Wrangler config final SHA-256:            $PROV_WRANGLER_CONFIG_FINAL_SHA256"
  echo "   APP_VERSION:                              $deploy_version"
  echo "   APP_BUILD_TIME:                           $build_time"
  echo "   Manifest file:                            $manifest_out"
  cat "$manifest_out"
}

# airtrust_verify_real_bundle_matches — DETECTION helper for a REAL deploy.
#
# In a real approved deploy window the caller runs `wrangler deploy --outdir
# <fresh mktemp -d>` (a genuine publish) and then calls this to confirm the
# bundle esbuild produced for the REAL deploy hashes identically to the dry-run
# bundle whose hash we already stamped into the vars. It is DETECTION, not
# prevention: the vars were already uploaded by the time this runs, so a
# mismatch means "the published AIRTRUST_WORKER_BUNDLE_SHA256 is unverified —
# treat this release as suspect and roll back", not "the bad value never
# shipped". A true guarantee would require bundling, hashing, then a second
# deploy with the verified hash; that doubles the network deploy per release
# and is deliberately not done here.
#
# THIS TASK NEVER CALLS IT: no real production deploy is performed. It exists so
# the comparison logic is in place and reviewed for the real deploy window.
#
# Usage: airtrust_verify_real_bundle_matches "$real_bundle_dir" "$expected_bundle_sha256"
airtrust_verify_real_bundle_matches() {
  local real_bundle_dir="$1" expected_sha="$2"
  local real_bundle_file real_sha
  real_bundle_file="$(find "$real_bundle_dir" -maxdepth 1 -name '*.js' | sort | head -n1)"
  if [[ -z "$real_bundle_file" ]]; then
    echo "❌ No bundled Worker module captured from the real deploy in $real_bundle_dir" >&2
    return 1
  fi
  real_sha="$(shasum -a 256 "$real_bundle_file" | awk '{print $1}')"
  if [[ "$real_sha" != "$expected_sha" ]]; then
    echo "❌ Bundle hash mismatch: dry-run bundle ($expected_sha) != real deploy bundle ($real_sha)" >&2
    echo "   The published AIRTRUST_WORKER_BUNDLE_SHA256 does not describe what was actually deployed. Roll back." >&2
    return 1
  fi
  echo "   Real deploy bundle hash matches published hash: $real_sha"
}
