#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
DB_NAME="airtrust-db-staging"
DB_ENV="staging"

fail() {
  echo "SCHEMA_0389_STAGING_READONLY=FAIL"
  echo "REASON=$1"
  exit 1
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

table_row_count_or_zero() {
  local exists="$1"
  local table_name="$2"

  if [[ "$exists" == "1" ]]; then
    query_remote_field "SELECT COUNT(*) AS total FROM ${table_name};" total
  else
    echo "0"
  fi
}

target="${AIRTRUST_CONTROLLED_TARGET:-}"
approval="${AIRTRUST_CONTROLLED_APPROVAL:-}"
snapshot_path="${AIRTRUST_CONTROLLED_SNAPSHOT_PATH:-}"
allow_remote_d1="${AIRTRUST_CONTROLLED_ALLOW_REMOTE_D1:-NO}"

[[ "$target" == "staging" ]] || fail "target_must_be_staging"
[[ -n "$approval" ]] || fail "approval_missing"
[[ -n "$snapshot_path" && -f "$snapshot_path" && -r "$snapshot_path" ]] || fail "snapshot_missing"
[[ "$allow_remote_d1" == "YES" ]] || fail "remote_d1_not_authorized"

case "$snapshot_path" in
  *prod*|*production*|*live*) fail "target_evidence_looks_like_production" ;;
esac

command -v python3 >/dev/null 2>&1 || fail "python3_not_found"

user_platform_roles_exists="$(
  query_remote_field \
    "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name='user_platform_roles';" \
    total
)"
support_access_grants_exists="$(
  query_remote_field \
    "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name='support_access_grants';" \
    total
)"
support_access_sessions_exists="$(
  query_remote_field \
    "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name='support_access_sessions';" \
    total
)"
audit_events_v2_exists="$(
  query_remote_field \
    "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name='audit_events_v2';" \
    total
)"
objects_0389_count="$(
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
d1_migrations_rows="$(
  query_remote_field \
    "SELECT COUNT(*) AS total FROM d1_migrations;" \
    total
)"
migration_0389_ledger_rows="$(
  query_remote_field \
    "SELECT COUNT(*) AS total FROM d1_migrations WHERE name = '0389_platform_roles_support_access_foundation.sql';" \
    total
)"
user_platform_roles_rows="$(
  table_row_count_or_zero "$user_platform_roles_exists" "user_platform_roles"
)"
support_access_grants_rows="$(
  table_row_count_or_zero "$support_access_grants_exists" "support_access_grants"
)"
support_access_sessions_rows="$(
  table_row_count_or_zero "$support_access_sessions_exists" "support_access_sessions"
)"

echo "SCHEMA_0389_STAGING_READONLY=PASS"
echo "TARGET=staging"
echo "APPROVAL=DECLARED"
echo "REMOTE_D1=YES"
echo "NO_DEPLOY=YES"
echo "NO_DQ01=YES"
echo "NO_MIG01=YES"
echo "NO_PII=YES"
echo "USER_PLATFORM_ROLES_EXISTS=$user_platform_roles_exists"
echo "SUPPORT_ACCESS_GRANTS_EXISTS=$support_access_grants_exists"
echo "SUPPORT_ACCESS_SESSIONS_EXISTS=$support_access_sessions_exists"
echo "AUDIT_EVENTS_V2_EXISTS=$audit_events_v2_exists"
echo "OBJECTS_0389_COUNT=$objects_0389_count"
echo "D1_MIGRATIONS_ROWS=$d1_migrations_rows"
echo "LEDGER_0389_ROWS=$migration_0389_ledger_rows"
echo "USER_PLATFORM_ROLES_ROWS=$user_platform_roles_rows"
echo "SUPPORT_ACCESS_GRANTS_ROWS=$support_access_grants_rows"
echo "SUPPORT_ACCESS_SESSIONS_ROWS=$support_access_sessions_rows"
echo "NOTE=Read-only remote D1 diagnostics only. No mutation was executed by this wrapper."
