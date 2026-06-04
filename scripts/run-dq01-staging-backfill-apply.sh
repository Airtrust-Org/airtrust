#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
DB_NAME="airtrust-db-staging"
DB_ENV="staging"

fail() {
  echo "DQ01_STAGING_BACKFILL_APPLY=BLOCKED"
  echo "REASON=$1"
  exit 2
}

json_field() {
  local field="$1"
  python3 -c 'import json, sys; field = sys.argv[1]; data = json.load(sys.stdin); print(data[0]["results"][0][field])' "$field"
}

json_meta_field() {
  local field="$1"
  python3 -c 'import json, sys; field = sys.argv[1]; data = json.load(sys.stdin); print(data[0]["meta"][field])' "$field"
}

query_sqlite_count() {
  local db_path="$1"
  local sql="$2"
  sqlite3 "$db_path" "$sql"
}

query_remote_json() {
  local sql="$1"
  (
    cd "$WORKER_DIR"
    npx wrangler d1 execute "$DB_NAME" --env "$DB_ENV" --remote --json --command "$sql"
  )
}

query_remote_count() {
  local sql="$1"
  query_remote_json "$sql" | json_field total
}

target="${AIRTRUST_CONTROLLED_TARGET:-}"
approval="${AIRTRUST_CONTROLLED_APPROVAL:-}"
snapshot_path="${AIRTRUST_CONTROLLED_SNAPSHOT_PATH:-}"
rollback_path="${AIRTRUST_CONTROLLED_ROLLBACK_PATH:-}"
safe_command="${AIRTRUST_CONTROLLED_SAFE_COMMAND:-}"
safe_command_reviewed="${AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED:-}"
allow_remote_d1="${AIRTRUST_CONTROLLED_ALLOW_REMOTE_D1:-NO}"
target_ref="${AIRTRUST_CONTROLLED_TARGET_REF:-}"
test_mode="${AIRTRUST_DQ01_STAGING_TEST_MODE:-NO}"
test_db_path="${AIRTRUST_DQ01_STAGING_TEST_DB_PATH:-}"

[[ "$target" == "staging" ]] || fail "target_must_be_staging"
[[ -n "$approval" ]] || fail "approval_missing"
[[ -n "$snapshot_path" && -f "$snapshot_path" && -r "$snapshot_path" ]] || fail "snapshot_missing"
[[ -n "$rollback_path" && -f "$rollback_path" && -r "$rollback_path" ]] || fail "rollback_missing"
[[ "$safe_command_reviewed" == "YES" ]] || fail "safe_command_not_reviewed"

case "$snapshot_path $rollback_path $safe_command $target_ref" in
  *prod*|*production*|*live*) fail "target_evidence_looks_like_production" ;;
esac

command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3_not_found"
command -v python3 >/dev/null 2>&1 || fail "python3_not_found"

snapshot_integrity="$(sqlite3 "$snapshot_path" "PRAGMA integrity_check;" 2>/dev/null || true)"
[[ "$snapshot_integrity" == "ok" ]] || fail "snapshot_integrity_check_failed"

expected_pre="$(
  query_sqlite_count \
    "$snapshot_path" \
    "SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NOT NULL AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';"
)"

if [[ "$test_mode" == "YES" ]]; then
  [[ -n "$test_db_path" && -f "$test_db_path" && -r "$test_db_path" && -w "$test_db_path" ]] || fail "test_db_path_missing_or_not_writable"
  remote_pre="$(
    query_sqlite_count \
      "$test_db_path" \
      "SELECT COUNT(*) AS total FROM funcionarios WHERE deleted_at IS NOT NULL AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';"
  )"
else
  [[ "$allow_remote_d1" == "YES" ]] || fail "remote_d1_not_authorized"

  table_exists="$(
    query_remote_count \
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name='funcionarios';"
  )"
  [[ "$table_exists" == "1" ]] || fail "funcionarios_table_missing"

  for column in status ativo deleted_at updated_at; do
    column_found="$(
      query_remote_count \
        "SELECT COUNT(*) AS total FROM pragma_table_info('funcionarios') WHERE name='${column}';"
    )"
    [[ "$column_found" == "1" ]] || fail "funcionarios_column_${column}_missing"
  done

  remote_pre="$(
    query_remote_count \
      "SELECT COUNT(*) AS total FROM funcionarios WHERE deleted_at IS NOT NULL AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';"
  )"
fi

[[ "$remote_pre" == "$expected_pre" ]] || fail "pre_count_mismatch_from_snapshot"

echo "DQ01_STAGING_BACKFILL_APPLY=RUNNING"
echo "TARGET=staging"
echo "APPROVAL=DECLARED"
echo "SNAPSHOT_EVIDENCE=YES"
echo "ROLLBACK_EVIDENCE=YES"
echo "REMOTE_D1=$([[ "$test_mode" == "YES" ]] && echo NO || echo YES)"
echo "NO_DEPLOY=YES"
echo "NO_MIG01=YES"
echo "NO_0389=YES"
echo "NO_PII=YES"
echo "PLAN | soft_delete_status_alignment | candidates=${remote_pre}"

if [[ "$test_mode" == "YES" ]]; then
  changed="$(
    sqlite3 "$test_db_path" <<'SQL'
BEGIN IMMEDIATE;
UPDATE funcionarios
SET status = 'INATIVO',
    ativo = 0,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL
  AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';
SELECT changes() AS changed;
COMMIT;
SQL
  )"

  post_count="$(
    query_sqlite_count \
      "$test_db_path" \
      "SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NOT NULL AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';"
  )"
else
  changed="$(
    query_remote_json \
      "UPDATE funcionarios
       SET status = 'INATIVO',
           ativo = 0,
           updated_at = datetime('now')
       WHERE deleted_at IS NOT NULL
         AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';" | json_meta_field changes
  )"

  post_count="$(
    query_remote_count \
      "SELECT COUNT(*) AS total FROM funcionarios WHERE deleted_at IS NOT NULL AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';"
  )"
fi

if [[ "$changed" != "$expected_pre" ]]; then
  echo "DQ01_STAGING_BACKFILL_APPLY=FAILED"
  echo "REASON=changed_count_mismatch"
  echo "EXPECTED=${expected_pre}"
  echo "CHANGED=${changed}"
  exit 1
fi

echo "APPLIED | soft_delete_status_alignment | changed=${changed}"
echo "REMAINING | soft_delete_status_alignment | count=${post_count}"
echo "DQ01_STAGING_BACKFILL_APPLY=COMPLETED"
echo "NOTE=Only the staging DQ-01 soft-delete status alignment was executed. Deploy, MIG-01 and 0389 remained out of scope."
