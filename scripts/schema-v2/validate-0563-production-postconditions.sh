#!/usr/bin/env bash
# source_reference: Schema V2 0563 reviewed manifest and pinned production D1.
# operational_decision: read-only physical postconditions before/after governed production apply.
# dry_run_required: false
# rollback_plan_required: false
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do
  case "$arg" in --target=*) target="${arg#*=}" ;; *) echo UNKNOWN_ARGUMENT >&2; exit 1 ;; esac
done
[[ "$target" == airtrust-db ]] || { echo PRODUCTION_DB_MISMATCH >&2; exit 1; }
query_count(){
  local sql="$1"
  (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") |
    node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),v=Number(d[0]?.results?.[0]?.count);if(!Number.isSafeInteger(v)||v<0)process.exit(1);console.log(v);})"
}
assert_count(){
  local label="$1" expected="$2" sql="$3" actual
  actual="$(query_count "$sql")"
  [[ "$actual" == "$expected" ]] || { echo "SCHEMA_0563_CHECK_FAILED: $label expected=$expected actual=$actual" >&2; exit 1; }
  echo "SCHEMA_0563_CHECK_OK=$label"
}
# Read-only verification. Never an authorization or a substitute for D1 Time Travel.
assert_count baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE';"
assert_count schema-ledger-0563 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='controle-voos-pilot-fueling-identity-0563';"
assert_count physical-fueling-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='cv_voo_abastecimentos';"
assert_count tenant-key 1 "SELECT COUNT(*) count FROM pragma_table_info('cv_voo_abastecimentos') WHERE name='empresa_id';"
assert_count flight-key 1 "SELECT COUNT(*) count FROM pragma_table_info('cv_voo_abastecimentos') WHERE name='voo_id';"
assert_count client-identity-column 1 "SELECT COUNT(*) count FROM pragma_table_info('cv_voo_abastecimentos') WHERE name='client_local_id';"
assert_count unique-partial-index 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND tbl_name='cv_voo_abastecimentos' AND name='uq_cv_voo_abastecimentos_client_event' AND sql LIKE '%WHERE client_local_id IS NOT NULL%';"
assert_count insert-format-trigger 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND tbl_name='cv_voo_abastecimentos' AND name='trg_cv_voo_abastecimentos_client_id_insert';"
assert_count immutable-client-id-trigger 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND tbl_name='cv_voo_abastecimentos' AND name='trg_cv_voo_abastecimentos_client_id_immutable';"
echo PILOT_FUELING_IDENTITY_0563_POSTCONDITIONS=PASS
