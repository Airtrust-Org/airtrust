#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
READINESS_AUDIT="$ROOT_DIR/scripts/audit-data-quality-readiness.sh"
GENERIC_GATE="$ROOT_DIR/scripts/controlled-execution-gate.sh"
EXECUTION_DOC="$ROOT_DIR/docs/AIRTRUST_DQ01_CONTROLLED_BACKFILL_EXECUTION_v0_5.md"
CONTRACT_DOC="$ROOT_DIR/docs/AIRTRUST_CONTROLLED_EXECUTION_ENVIRONMENT_CONTRACT_v0_5.md"
RUNBOOK_DOC="$ROOT_DIR/docs/AIRTRUST_DQ01_MIG01_CONTROLLED_EXECUTION_RUNBOOK_v0_5.md"

fail_reasons=()

add_reason() {
  fail_reasons+=("$1")
}

bash "$READINESS_AUDIT" >/dev/null
[[ -f "$GENERIC_GATE" ]] || add_reason "controlled_execution_gate_missing"
[[ -f "$EXECUTION_DOC" ]] || add_reason "execution_doc_missing"
[[ -f "$CONTRACT_DOC" ]] || add_reason "environment_contract_doc_missing"
[[ -f "$RUNBOOK_DOC" ]] || add_reason "controlled_execution_runbook_missing"

if (( ${#fail_reasons[@]} > 0 )); then
  echo "DQ01_BACKFILL_GATE=BLOCKED_BY_ENVIRONMENT_READINESS"
  echo "REASONS=$(IFS=,; printf '%s' "${fail_reasons[*]}")"
  exit 2
fi

target="${AIRTRUST_CONTROLLED_TARGET:-${AIRTRUST_DQ01_TARGET:-}}"
approval="${AIRTRUST_CONTROLLED_APPROVAL:-${AIRTRUST_DQ01_APPROVED_BY:-}}"
db_path="${AIRTRUST_DB_PATH:-${AIRTRUST_DQ01_DB_PATH:-}}"
target_ref="${AIRTRUST_CONTROLLED_TARGET_REF:-${AIRTRUST_DQ01_TARGET_REF:-}}"
snapshot_path="${AIRTRUST_CONTROLLED_SNAPSHOT_PATH:-${AIRTRUST_DQ01_SNAPSHOT_PATH:-}}"
snapshot_ref="${AIRTRUST_CONTROLLED_SNAPSHOT_REF:-${AIRTRUST_DQ01_SNAPSHOT_REF:-}}"
rollback_path="${AIRTRUST_CONTROLLED_ROLLBACK_PATH:-${AIRTRUST_DQ01_ROLLBACK_PLAN_PATH:-}}"
rollback_ref="${AIRTRUST_CONTROLLED_ROLLBACK_REF:-${AIRTRUST_DQ01_ROLLBACK_REF:-}}"
safe_command="${AIRTRUST_CONTROLLED_SAFE_COMMAND:-${AIRTRUST_DQ01_SAFE_COMMAND:-}}"
safe_command_reviewed="${AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED:-${AIRTRUST_DQ01_SAFE_COMMAND_REVIEWED:-}}"
allow_production="${AIRTRUST_CONTROLLED_PRODUCTION_APPROVED:-${AIRTRUST_DQ01_PRODUCTION_APPROVED:-}}"
allow_remote_d1="${AIRTRUST_CONTROLLED_ALLOW_REMOTE_D1:-${AIRTRUST_DQ01_ALLOW_REMOTE_D1:-NO}}"

if output="$(
  AIRTRUST_CONTROLLED_MODE="dq01-backfill" \
  AIRTRUST_CONTROLLED_TARGET="$target" \
  AIRTRUST_CONTROLLED_APPROVAL="$approval" \
  AIRTRUST_DB_PATH="$db_path" \
  AIRTRUST_CONTROLLED_TARGET_REF="$target_ref" \
  AIRTRUST_CONTROLLED_SNAPSHOT_PATH="$snapshot_path" \
  AIRTRUST_CONTROLLED_SNAPSHOT_REF="$snapshot_ref" \
  AIRTRUST_CONTROLLED_ROLLBACK_PATH="$rollback_path" \
  AIRTRUST_CONTROLLED_ROLLBACK_REF="$rollback_ref" \
  AIRTRUST_CONTROLLED_SAFE_COMMAND="$safe_command" \
  AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED="$safe_command_reviewed" \
  AIRTRUST_CONTROLLED_PRODUCTION_APPROVED="$allow_production" \
  AIRTRUST_CONTROLLED_ALLOW_REMOTE_D1="$allow_remote_d1" \
  bash "$GENERIC_GATE"
)"; then
  echo "DQ01_BACKFILL_GATE=READY_FOR_MANUAL_CONTROLLED_EXECUTION"
  printf '%s\n' "$output"
  echo "NOTE=DQ01 gate passed. No backfill was executed by this script."
else
  status=$?
  echo "DQ01_BACKFILL_GATE=BLOCKED_BY_ENVIRONMENT_READINESS"
  printf '%s\n' "$output"
  exit "$status"
fi
