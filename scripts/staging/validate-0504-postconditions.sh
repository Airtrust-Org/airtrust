#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; BLOCKED_PRODUCTION_DB_NAME="airtrust-db"; MIGRATION_BASENAME="0504_controle_voos_operational_model.sql"
target=""; for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" && "$target" != "$BLOCKED_PRODUCTION_DB_NAME" ]] || { echo "ERROR: staging 0504 validator refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';"
assert_count operational-catalog-tables 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name IN ('cv_contratos','cv_funcoes_bordo');"
assert_count flight-columns 3 "SELECT COUNT(*) count FROM pragma_table_info('cv_voos') WHERE name IN ('numero_voo','numero_db','contrato_id');"
assert_count crew-role-column 1 "SELECT COUNT(*) count FROM pragma_table_info('cv_voo_tripulantes') WHERE name='funcao_bordo_id';"
assert_count requested-flight-types 5 "SELECT COUNT(DISTINCT codigo) count FROM cv_tipos_voo WHERE codigo IN ('CONTRATO','SPOT','MANUTENCAO','TREINAMENTO','AEROMEDICO') AND ativo=1 AND deleted_at IS NULL;"
assert_count requested-onboard-roles 4 "SELECT COUNT(DISTINCT codigo) count FROM cv_funcoes_bordo WHERE codigo IN ('EXAMINADOR','INSTRUTOR','COMANDANTE','COPILOTO') AND ativo=1 AND deleted_at IS NULL;"
echo CONTROLE_VOOS_OPERATIONAL_MODEL_0504_STAGING_POSTCONDITIONS=PASS
