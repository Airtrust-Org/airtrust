#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
MIGRATION_FILE="$WORKER_DIR/migrations/0389_platform_roles_support_access_foundation.sql"
DB_NAME="airtrust-db-staging"
DB_ENV="staging"

fail() {
  echo "SCHEMA_0389_STAGING_APPLY=BLOCKED"
  echo "REASON=$1"
  exit 2
}

json_field() {
  local field="$1"
  python3 -c 'import json, sys; field = sys.argv[1]; payload = json.load(sys.stdin); data = payload[0] if isinstance(payload, list) else payload; print(data["results"][0][field])' "$field"
}

query_remote_json() {
  local sql="$1"
  (
    cd "$WORKER_DIR"
    npx wrangler d1 execute "$DB_NAME" --env "$DB_ENV" --remote --json --command "$sql"
  )
}

query_remote_field() {
  local sql="$1"
  local field="$2"
  query_remote_json "$sql" | json_field "$field"
}

target="${AIRTRUST_CONTROLLED_TARGET:-}"
approval="${AIRTRUST_CONTROLLED_APPROVAL:-}"
snapshot_path="${AIRTRUST_CONTROLLED_SNAPSHOT_PATH:-}"
rollback_path="${AIRTRUST_CONTROLLED_ROLLBACK_PATH:-}"
safe_command="${AIRTRUST_CONTROLLED_SAFE_COMMAND:-}"
safe_command_reviewed="${AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED:-}"
allow_remote_d1="${AIRTRUST_CONTROLLED_ALLOW_REMOTE_D1:-NO}"
target_ref="${AIRTRUST_CONTROLLED_TARGET_REF:-}"

[[ "$target" == "staging" ]] || fail "target_must_be_staging"
[[ -n "$approval" ]] || fail "approval_missing"
[[ -n "$snapshot_path" && -f "$snapshot_path" && -r "$snapshot_path" ]] || fail "snapshot_missing"
[[ -n "$rollback_path" && -f "$rollback_path" && -r "$rollback_path" ]] || fail "rollback_missing"
[[ -n "$target_ref" ]] || fail "target_ref_missing"
[[ "$safe_command_reviewed" == "YES" ]] || fail "safe_command_not_reviewed"
[[ "$allow_remote_d1" == "YES" ]] || fail "remote_d1_not_authorized"
[[ -f "$MIGRATION_FILE" && -r "$MIGRATION_FILE" ]] || fail "migration_file_missing"

case "$snapshot_path $rollback_path $safe_command $target_ref" in
  *prod*|*production*|*live*) fail "target_evidence_looks_like_production" ;;
esac

printf '%s' "$safe_command" | LC_ALL=C grep -Eq 'run-0389-staging-schema-apply\.sh' || fail "safe_command_not_0389_apply"
printf '%s' "$safe_command" | LC_ALL=C grep -Eiq '(^|[^a-z])(deploy|dq01|mig01)([^a-z]|$)' && fail "safe_command_contains_out_of_scope_keyword"

command -v python3 >/dev/null 2>&1 || fail "python3_not_found"

pre_objects_0389_count="$(
  query_remote_field \
    "SELECT COUNT(*) AS total FROM sqlite_master WHERE name IN (
      'user_platform_roles',
      'support_access_grants',
      'support_access_sessions',
      'idx_user_platform_roles_active_unique',
      'idx_user_platform_roles_lookup',
      'idx_support_access_grants_active_unique',
      'idx_support_access_grants_lookup',
      'idx_support_access_sessions_active',
      'idx_support_access_sessions_request'
    );" \
    total
)"
pre_ledger_0389_rows="$(
  query_remote_field \
    "SELECT COUNT(*) AS total FROM d1_migrations WHERE name = '0389_platform_roles_support_access_foundation.sql';" \
    total
)"

[[ "$pre_objects_0389_count" == "0" ]] || fail "preexisting_0389_objects_detected"
[[ "$pre_ledger_0389_rows" == "0" ]] || fail "preexisting_0389_ledger_detected"

echo "SCHEMA_0389_STAGING_APPLY=RUNNING"
echo "TARGET=staging"
echo "APPROVAL=DECLARED"
echo "REMOTE_D1=YES"
echo "NO_DEPLOY=YES"
echo "NO_DQ01=YES"
echo "NO_MIG01=YES"
echo "NO_PII=YES"
echo "PRE_OBJECTS_0389_COUNT=$pre_objects_0389_count"

(
  cd "$WORKER_DIR"
  npx wrangler d1 execute "$DB_NAME" --env "$DB_ENV" --remote --file "$MIGRATION_FILE"
) >/tmp/airtrust-0389-apply.log 2>&1 || {
  cat /tmp/airtrust-0389-apply.log
  fail "wrangler_execute_failed"
}

post_objects_0389_count="$(
  query_remote_field \
    "SELECT COUNT(*) AS total FROM sqlite_master WHERE name IN (
      'user_platform_roles',
      'support_access_grants',
      'support_access_sessions',
      'idx_user_platform_roles_active_unique',
      'idx_user_platform_roles_lookup',
      'idx_support_access_grants_active_unique',
      'idx_support_access_grants_lookup',
      'idx_support_access_sessions_active',
      'idx_support_access_sessions_request'
    );" \
    total
)"
post_ledger_0389_rows="$(
  query_remote_field \
    "SELECT COUNT(*) AS total FROM d1_migrations WHERE name = '0389_platform_roles_support_access_foundation.sql';" \
    total
)"

[[ "$post_objects_0389_count" == "9" ]] || fail "post_apply_objects_0389_unexpected"

echo "POST_OBJECTS_0389_COUNT=$post_objects_0389_count"
echo "POST_LEDGER_0389_ROWS=$post_ledger_0389_rows"
echo "SCHEMA_0389_STAGING_APPLY=COMPLETED"
echo "NOTE=Only the 0389 schema file was executed directly against staging D1. No deploy, no DQ01 and no MIG01 were executed."
