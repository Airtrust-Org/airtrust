#!/usr/bin/env bash
# Read-only staging proof for 0488 Pilot offline synchronization receipts.
# The validator is intentionally locked to the official staging D1 and never
# mutates schema or operational data.
set -euo pipefail

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
MIGRATION_BASENAME="0488_controle_voos_pilot_offline_sync_receipts.sql"

db_name=""
for arg in "$@"; do
  case "$arg" in
    --target=*) db_name="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg (use --target=<db_name>)" >&2; exit 1 ;;
  esac
done

if [[ "$db_name" != "$ALLOWED_DB_NAME" ]]; then
  echo "ERROR: --target deve ser exatamente $ALLOWED_DB_NAME." >&2
  exit 1
fi
if [[ "$db_name" == "airtrust-db" || "$db_name" == "$BLOCKED_PRODUCTION_DB_ID" ]]; then
  echo "ERROR: alvo de producao recusado." >&2
  exit 1
fi

run_query() {
  (cd worker-airtrust && npx wrangler d1 execute "$db_name" --remote --json --command "$1")     | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const s=d.indexOf("[");const e=d.lastIndexOf("]");const x=JSON.parse(s>=0&&e>s?d.slice(s,e+1):d);console.log(JSON.stringify((Array.isArray(x)?x[0]:x)?.results??[]));})'
}

assert_json() {
  local description="$1"
  local sql="$2"
  local predicate="$3"
  local result
  result="$(run_query "$sql")"
  echo "$description: $result"
  RESULT="$result" node -e "$predicate" || { echo "FAIL: $description" >&2; return 1; }
}

fail=0

assert_json   "0488 migration ledger exists exactly once"   "SELECT COUNT(*) AS n FROM d1_migrations WHERE name='$MIGRATION_BASENAME'"   'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json   "0488 receipt table exists exactly once"   "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='cv_offline_sync_receipts'"   'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json   "0488 receipt columns are complete"   "SELECT COUNT(*) AS n FROM pragma_table_info('cv_offline_sync_receipts') WHERE name IN ('id','empresa_id','client_operation_id','voo_id','usuario_id','funcionario_id','device_id','command_type','entity_type','canonical_entity_id','payload_hash','base_server_version','server_entity_version','result_status','result_code','result_json','received_at','updated_at')"   'if (JSON.parse(process.env.RESULT)[0]?.n !== 18) process.exit(1)' || fail=1

assert_json   "0488 named indexes exist"   "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name IN ('uq_cv_offline_sync_receipts_empresa_operation','idx_cv_offline_sync_receipts_voo_received','idx_cv_offline_sync_receipts_actor_device')"   'if (JSON.parse(process.env.RESULT)[0]?.n !== 3) process.exit(1)' || fail=1

assert_json   "0488 tenant-operation index is unique"   "SELECT COUNT(*) AS n FROM pragma_index_list('cv_offline_sync_receipts') WHERE name='uq_cv_offline_sync_receipts_empresa_operation' AND \"unique\"=1"   'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json   "0488 result-status constraint remains present"   "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='cv_offline_sync_receipts' AND sql LIKE '%accepted%' AND sql LIKE '%conflict%' AND sql LIKE '%rejected_retriable%' AND sql LIKE '%rejected_permanent%'"   'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json   "0488 contains no duplicate tenant operation ids"   "SELECT COUNT(*) AS n FROM (SELECT empresa_id, client_operation_id FROM cv_offline_sync_receipts GROUP BY empresa_id, client_operation_id HAVING COUNT(*) > 1)"   'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi

echo "PILOT_OFFLINE_SYNC_RECEIPTS_0488_STAGING_POSTCONDITIONS=PASS"
