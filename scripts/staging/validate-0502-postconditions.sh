#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
BLOCKED_PRODUCTION_DB_NAME="airtrust-db"
MIGRATION_BASENAME="0502_controle_voos_fueling_companies.sql"
target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" && "$target" != "$BLOCKED_PRODUCTION_DB_NAME" ]] || { echo "ERROR: staging 0502 validator refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';"
assert_count fueling-company-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='cv_empresas_abastecimento';"
assert_count fueling-company-columns 12 "SELECT COUNT(*) count FROM pragma_table_info('cv_empresas_abastecimento') WHERE name IN ('id','empresa_id','codigo','nome','descricao','ativo','ordem','created_by','updated_by','created_at','updated_at','deleted_at');"
assert_count fueling-company-indexes 3 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name IN ('idx_cv_empresas_abastecimento_empresa_codigo','idx_cv_empresas_abastecimento_empresa_ativo','idx_cv_empresas_abastecimento_empresa_deleted');"
echo CONTROLE_VOOS_FUELING_COMPANIES_0502_STAGING_POSTCONDITIONS=PASS
