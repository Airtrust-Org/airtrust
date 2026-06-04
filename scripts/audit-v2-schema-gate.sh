#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_FILE="$ROOT_DIR/worker-airtrust/migrations/0385_audit_events_v2.sql"
READONLY_SCRIPT="$ROOT_DIR/scripts/run-audit-rbac-v2-staging-readonly.sh"
APPLY_SCRIPT="$ROOT_DIR/scripts/run-audit-v2-staging-schema-apply.sh"

fail() {
  echo "AUDIT_V2_SCHEMA_GATE=BLOCKED"
  echo "REASON=$1"
  exit 2
}

mode="${AIRTRUST_CONTROLLED_MODE:-}"
target="${AIRTRUST_CONTROLLED_TARGET:-}"
approval="${AIRTRUST_CONTROLLED_APPROVAL:-}"
snapshot_path="${AIRTRUST_CONTROLLED_SNAPSHOT_PATH:-}"
rollback_path="${AIRTRUST_CONTROLLED_ROLLBACK_PATH:-}"
safe_command="${AIRTRUST_CONTROLLED_SAFE_COMMAND:-}"
safe_command_reviewed="${AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED:-}"
allow_remote_d1="${AIRTRUST_CONTROLLED_ALLOW_REMOTE_D1:-NO}"
target_ref="${AIRTRUST_CONTROLLED_TARGET_REF:-}"

[[ "$mode" == "audit-v2-schema" ]] || fail "mode_must_be_audit_v2_schema"
[[ "$target" == "staging" ]] || fail "target_must_be_staging"
[[ -n "$approval" ]] || fail "approval_missing"
[[ -n "$snapshot_path" && -f "$snapshot_path" && -r "$snapshot_path" ]] || fail "snapshot_missing_or_unreadable"
[[ -n "$rollback_path" && -f "$rollback_path" && -r "$rollback_path" ]] || fail "rollback_missing_or_unreadable"
[[ -f "$MIGRATION_FILE" && -r "$MIGRATION_FILE" ]] || fail "migration_file_missing"
[[ -x "$READONLY_SCRIPT" ]] || fail "readonly_script_missing_or_not_executable"
[[ -x "$APPLY_SCRIPT" ]] || fail "apply_script_missing_or_not_executable"
[[ "$safe_command_reviewed" == "YES" ]] || fail "safe_command_not_reviewed"
[[ "$allow_remote_d1" == "YES" ]] || fail "remote_d1_not_authorized"
[[ -n "$target_ref" ]] || fail "target_ref_missing"

case "$snapshot_path $rollback_path $safe_command $target_ref" in
  *prod*|*production*|*live*) fail "target_evidence_looks_like_production" ;;
esac

printf '%s' "$safe_command" | LC_ALL=C grep -Eq 'run-audit-v2-staging-schema-apply\.sh' || fail "safe_command_not_audit_v2_apply"
printf '%s' "$safe_command" | LC_ALL=C grep -Eiq '(^|[^a-z])(audit-v2|audit_v2)([^a-z]|$)' || fail "safe_command_missing_audit_v2_marker"
printf '%s' "$safe_command" | LC_ALL=C grep -Eiq '(^|[^a-z])(deploy|dq01|mig01|0389)([^a-z]|$)' && fail "safe_command_contains_out_of_scope_keyword"

echo "AUDIT_V2_SCHEMA_GATE=READY_FOR_MANUAL_CONTROLLED_EXECUTION"
echo "MODE=audit-v2-schema"
echo "TARGET=staging"
echo "APPROVAL=DECLARED"
echo "SNAPSHOT_EVIDENCE=YES"
echo "ROLLBACK_EVIDENCE=YES"
echo "MIGRATION_FILE=YES"
echo "READONLY_SCRIPT=YES"
echo "APPLY_SCRIPT=YES"
echo "REMOTE_D1_ALLOWED=YES"
echo "SAFE_COMMAND_REVIEWED=YES"
echo "NOTE=Audit v2 schema package is constrained to staging, approved remote D1 access and the dedicated apply wrapper."
