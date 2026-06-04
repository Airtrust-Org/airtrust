#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
READINESS_AUDIT="$ROOT_DIR/scripts/audit-data-quality-readiness.sh"
EXECUTION_DOC="$ROOT_DIR/docs/AIRTRUST_DQ01_CONTROLLED_BACKFILL_EXECUTION_v0_5.md"

target="${AIRTRUST_DQ01_TARGET:-}"
approval="${AIRTRUST_DQ01_APPROVED_BY:-}"
db_path="${AIRTRUST_DQ01_DB_PATH:-}"
snapshot_path="${AIRTRUST_DQ01_SNAPSHOT_PATH:-}"
snapshot_ref="${AIRTRUST_DQ01_SNAPSHOT_REF:-}"
rollback_path="${AIRTRUST_DQ01_ROLLBACK_PLAN_PATH:-}"
rollback_ref="${AIRTRUST_DQ01_ROLLBACK_REF:-}"
safe_command_ack="${AIRTRUST_DQ01_SAFE_COMMAND_REVIEWED:-}"

fail_reasons=()

add_reason() {
  fail_reasons+=("$1")
}

has_snapshot_evidence() {
  [[ -n "$snapshot_ref" ]] || [[ -n "$snapshot_path" && -f "$snapshot_path" ]]
}

has_rollback_evidence() {
  [[ -n "$rollback_ref" ]] || [[ -n "$rollback_path" && -f "$rollback_path" ]]
}

bash "$READINESS_AUDIT" >/dev/null
[[ -f "$EXECUTION_DOC" ]] || add_reason "execution_doc_missing"

if [[ -z "$target" ]]; then
  add_reason "target_not_declared"
elif [[ "$target" != "staging" ]]; then
  add_reason "target_must_be_staging"
fi

[[ -n "$approval" ]] || add_reason "approval_missing"
[[ -n "$db_path" && -f "$db_path" ]] || add_reason "db_path_missing_or_unreadable"
has_snapshot_evidence || add_reason "snapshot_missing"
has_rollback_evidence || add_reason "rollback_missing"
[[ "$safe_command_ack" == "YES" ]] || add_reason "safe_command_not_reviewed"

if (( ${#fail_reasons[@]} > 0 )); then
  echo "DQ01_BACKFILL_GATE=BLOCKED_BY_ENVIRONMENT_READINESS"
  echo "TARGET=${target:-UNSET}"
  echo "APPROVED_BY=${approval:-UNSET}"
  echo "DB_PATH=${db_path:-UNSET}"
  echo "REASONS=$(IFS=,; printf '%s' "${fail_reasons[*]}")"
  exit 2
fi

echo "DQ01_BACKFILL_GATE=READY_FOR_MANUAL_CONTROLLED_EXECUTION"
echo "TARGET=$target"
echo "APPROVED_BY=$approval"
echo "DB_PATH=$db_path"
echo "SNAPSHOT_EVIDENCE=YES"
echo "ROLLBACK_EVIDENCE=YES"
echo "SAFE_COMMAND_REVIEWED=YES"
echo "NOTE=Gate passed. No backfill was executed by this script."

