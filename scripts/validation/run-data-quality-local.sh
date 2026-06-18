#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VALIDATOR="$ROOT_DIR/scripts/validation/validate-data-quality-sql.sh"

fail() {
  echo "$1" >&2
  exit 1
}

discover_local_db() {
  local candidates=(
    "$ROOT_DIR/worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
    "$ROOT_DIR/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
  )
  local state_dir=""
  local best_file=""
  local best_size="-1"
  local file size

  for state_dir in "${candidates[@]}"; do
    [[ -d "$state_dir" ]] || continue
    while IFS= read -r -d '' file; do
      size=$(stat -f '%z' "$file" 2>/dev/null || echo 0)
      if [[ "$size" -gt "$best_size" ]]; then
        best_size="$size"
        best_file="$file"
      fi
    done < <(find "$state_dir" -maxdepth 1 -type f -name '*.sqlite' ! -name 'metadata.sqlite' -print0)
  done

  [[ -n "$best_file" ]] || return 1
  printf '%s\n' "$best_file"
}

[[ "${AIRTRUST_ALLOW_DATA_QUALITY_RUN:-}" == "YES" ]] || fail "SKIPPED_DATA_QUALITY_RUN — AIRTRUST_ALLOW_DATA_QUALITY_RUN must be YES"

TARGET="${AIRTRUST_DATA_QUALITY_TARGET:-}"
case "$TARGET" in
  local|staging) ;;
  production) fail "SKIPPED_DATA_QUALITY_RUN — production target forbidden" ;;
  "") fail "SKIPPED_DATA_QUALITY_RUN — AIRTRUST_DATA_QUALITY_TARGET must be local or staging" ;;
  *) fail "SKIPPED_DATA_QUALITY_RUN — AIRTRUST_DATA_QUALITY_TARGET must be local or staging" ;;
esac

bash "$VALIDATOR"

DB_PATH="${AIRTRUST_DATA_QUALITY_DB_PATH:-${AIRTRUST_DATA_QUALITY_STAGING_DB_PATH:-}}"
if [[ -z "$DB_PATH" && "$TARGET" == "local" ]]; then
  DB_PATH="$(discover_local_db || true)"
fi

[[ -n "$DB_PATH" && -f "$DB_PATH" ]] || fail "SKIPPED_DATA_QUALITY_RUN — local/staging database not configured"

if [[ "$TARGET" == "staging" && -z "${AIRTRUST_DATA_QUALITY_DB_PATH:-${AIRTRUST_DATA_QUALITY_STAGING_DB_PATH:-}}" ]]; then
  fail "SKIPPED_DATA_QUALITY_RUN — staging database path not configured"
fi

echo "DEPRECATED: scripts/validation/run-data-quality-local.sh agora delega para scripts/integrity/run-integrity.mjs" >&2

ARGS=(
  node
  "$ROOT_DIR/scripts/integrity/run-integrity.mjs"
  --db
  "$DB_PATH"
  --fail-on-severity
  "${AIRTRUST_DATA_QUALITY_FAIL_ON_SEVERITY:-${AIRTRUST_INTEGRITY_FAIL_ON_SEVERITY:-P0}}"
)

if [[ -n "${AIRTRUST_DATA_QUALITY_BASELINE:-${AIRTRUST_INTEGRITY_BASELINE:-}}" ]]; then
  ARGS+=(
    --baseline
    "${AIRTRUST_DATA_QUALITY_BASELINE:-${AIRTRUST_INTEGRITY_BASELINE:-}}"
  )
fi

"${ARGS[@]}"
