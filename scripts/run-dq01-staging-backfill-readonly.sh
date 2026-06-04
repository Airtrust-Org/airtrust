#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/validation/run-data-quality-local.sh"

fail() {
  echo "DQ01_STAGING_BACKFILL_READONLY=FAIL"
  echo "REASON=$1"
  exit 1
}

[[ -f "$RUNNER" ]] || fail "runner_not_found"

target="${AIRTRUST_CONTROLLED_TARGET:-}"
snapshot_path="${AIRTRUST_CONTROLLED_SNAPSHOT_PATH:-}"

[[ "$target" == "staging" ]] || fail "target_must_be_staging"
[[ -n "$snapshot_path" && -f "$snapshot_path" && -r "$snapshot_path" ]] || fail "snapshot_missing"

case "$snapshot_path" in
  *prod*|*production*|*live*) fail "target_evidence_looks_like_production" ;;
esac

command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3_not_found"

integrity="$(sqlite3 "$snapshot_path" "PRAGMA integrity_check;" 2>/dev/null || true)"
[[ "$integrity" == "ok" ]] || fail "snapshot_integrity_check_failed"

export AIRTRUST_ALLOW_DATA_QUALITY_RUN="YES"
export AIRTRUST_DATA_QUALITY_TARGET="staging"
export AIRTRUST_DATA_QUALITY_DB_PATH="$snapshot_path"

echo "DQ01_STAGING_BACKFILL_READONLY=RUNNING"
echo "TARGET=staging"
echo "SNAPSHOT_EVIDENCE=YES"
echo "NO_PII=YES"
echo "NOTE=Invoking read-only DQ diagnostics on staging snapshot. No mutation is performed by this wrapper."

bash "$RUNNER"
