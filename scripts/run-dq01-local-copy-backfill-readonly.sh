#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT_DIR/scripts/validation/run-data-quality-local.sh"

[[ -f "$RUNNER" ]] || {
  echo "DQ01_LOCAL_COPY_BACKFILL_READONLY=FAIL"
  echo "REASON=runner_not_found"
  exit 1
}

target="${AIRTRUST_DATA_QUALITY_TARGET:-local}"
if [[ "$target" != "local" ]]; then
  echo "DQ01_LOCAL_COPY_BACKFILL_READONLY=FAIL"
  echo "REASON=local_copy_only"
  exit 1
fi

export AIRTRUST_ALLOW_DATA_QUALITY_RUN="YES"
export AIRTRUST_DATA_QUALITY_TARGET="local"

if [[ -n "${AIRTRUST_DB_PATH:-}" && -z "${AIRTRUST_DATA_QUALITY_DB_PATH:-}" ]]; then
  export AIRTRUST_DATA_QUALITY_DB_PATH="$AIRTRUST_DB_PATH"
fi

echo "DQ01_LOCAL_COPY_BACKFILL_READONLY=RUNNING"
echo "NOTE=Invoking read-only DQ diagnostics on local-copy. No mutation is performed by this wrapper."

bash "$RUNNER"
