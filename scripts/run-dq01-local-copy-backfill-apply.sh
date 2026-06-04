#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail() {
  echo "DQ01_LOCAL_COPY_BACKFILL_APPLY=BLOCKED"
  echo "REASON=$1"
  exit 2
}

target="${AIRTRUST_CONTROLLED_TARGET:-}"
approval="${AIRTRUST_CONTROLLED_APPROVAL:-}"
db_path="${AIRTRUST_DB_PATH:-}"
snapshot_path="${AIRTRUST_CONTROLLED_SNAPSHOT_PATH:-}"
rollback_path="${AIRTRUST_CONTROLLED_ROLLBACK_PATH:-}"
safe_command_reviewed="${AIRTRUST_CONTROLLED_SAFE_COMMAND_REVIEWED:-}"

[[ "$target" == "local-copy" ]] || fail "target_must_be_local_copy"
[[ -n "$approval" ]] || fail "approval_missing"
[[ -n "$db_path" && -f "$db_path" && -r "$db_path" && -w "$db_path" ]] || fail "db_path_missing_or_not_writable"
[[ -n "$snapshot_path" && -f "$snapshot_path" && -r "$snapshot_path" ]] || fail "snapshot_missing"
[[ -n "$rollback_path" && -f "$rollback_path" && -r "$rollback_path" ]] || fail "rollback_missing"
[[ "$safe_command_reviewed" == "YES" ]] || fail "safe_command_not_reviewed"

case "$db_path $snapshot_path $rollback_path" in
  *prod*|*production*|*live*) fail "target_evidence_looks_like_production" ;;
esac

command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3_not_found"

table_exists="$(sqlite3 "$db_path" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='funcionarios';")"
[[ "$table_exists" == "1" ]] || fail "funcionarios_table_missing"

for column in status ativo deleted_at updated_at; do
  found="$(sqlite3 "$db_path" "SELECT COUNT(*) FROM pragma_table_info('funcionarios') WHERE name='$column';")"
  [[ "$found" == "1" ]] || fail "funcionarios_column_${column}_missing"
done

pre_soft_delete_active="$(
  sqlite3 "$db_path" "SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NOT NULL AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';"
)"

echo "DQ01_LOCAL_COPY_BACKFILL_APPLY=RUNNING"
echo "TARGET=local-copy"
echo "APPROVAL=DECLARED"
echo "DB_EVIDENCE=YES"
echo "SNAPSHOT_EVIDENCE=YES"
echo "ROLLBACK_EVIDENCE=YES"
echo "NO_REMOTE_D1=YES"
echo "NO_PII=YES"
echo "PLAN | soft_delete_status_alignment | candidates=${pre_soft_delete_active}"

changed="$(
  sqlite3 "$db_path" <<'SQL'
BEGIN IMMEDIATE;
UPDATE funcionarios
SET status = 'INATIVO',
    ativo = 0,
    updated_at = datetime('now')
WHERE deleted_at IS NOT NULL
  AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';
SELECT changes();
COMMIT;
SQL
)"

post_soft_delete_active="$(
  sqlite3 "$db_path" "SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NOT NULL AND UPPER(COALESCE(status, 'ATIVO')) = 'ATIVO';"
)"

if [[ "$changed" != "$pre_soft_delete_active" ]]; then
  echo "DQ01_LOCAL_COPY_BACKFILL_APPLY=FAILED"
  echo "REASON=changed_count_mismatch"
  echo "EXPECTED=${pre_soft_delete_active}"
  echo "CHANGED=${changed}"
  exit 1
fi

echo "APPLIED | soft_delete_status_alignment | changed=${changed}"
echo "REMAINING | soft_delete_status_alignment | count=${post_soft_delete_active}"
echo "DQ01_LOCAL_COPY_BACKFILL_APPLY=COMPLETED"
echo "NOTE=Only unambiguous local-copy soft-delete status alignment was mutated. Other DQ warnings remain for explicit business decision."
