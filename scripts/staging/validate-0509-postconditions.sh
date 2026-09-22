#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0509 validator refused target: $target" >&2; exit 1; }
query_count(){
 local sql="$1"
 (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") |
   node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"
}
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0509_controle_voos_flight_plan.sql';"
assert_count flight-plan-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='cv_planos_voo';"
assert_count flight-plan-events-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='cv_plano_voo_eventos';"
assert_count flight-plan-indexes 5 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name IN ('idx_cv_planos_voo_empresa_voo_active','idx_cv_planos_voo_empresa_status_data','idx_cv_planos_voo_empresa_provider_status','idx_cv_plano_voo_eventos_empresa_plano_created','idx_cv_plano_voo_eventos_empresa_external');"
assert_count flight-plan-triggers 5 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_cv_planos_voo_tenant_insert_0509','trg_cv_planos_voo_link_immutable_0509','trg_cv_plano_voo_eventos_tenant_insert_0509','trg_cv_plano_voo_eventos_no_update_0509','trg_cv_plano_voo_eventos_no_delete_0509');"
assert_count credential-columns 0 "SELECT COUNT(*) count FROM pragma_table_info('cv_planos_voo') WHERE lower(name) GLOB '*senha*' OR lower(name) GLOB '*password*' OR lower(name) GLOB '*token*' OR lower(name) GLOB '*secret*' OR lower(name) GLOB '*cookie*' OR lower(name) GLOB '*credential*';"
echo CONTROLE_VOOS_FLIGHT_PLAN_0509_STAGING_POSTCONDITIONS=PASS
