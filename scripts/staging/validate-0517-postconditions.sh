#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0517 validator refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger-0517 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0517_training_compliance_conditions.sql';"
assert_count compliance-condition-tables 2 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name IN ('compliance_condicoes','funcionarios_compliance_condicoes');"
assert_count requirement-audit-columns 8 "SELECT COUNT(*) count FROM pragma_table_info('treinamento_requisitos') WHERE name IN ('condicao_id','justificativa','perfil_competencia','modalidade_requerida','fundamento_tipo','fundamento_documento','fundamento_item','validade_fonte');"
assert_count compliance-condition-indexes 6 "SELECT COUNT(*) count FROM sqlite_master WHERE type='index' AND name IN ('idx_compliance_condicoes_codigo_active','idx_compliance_condicoes_empresa_tipo','idx_func_compliance_condicao_active','idx_func_compliance_condicoes_lookup','idx_treinamento_requisitos_unique_active','idx_treinamento_requisitos_condicao');"
assert_count compliance-condition-triggers 4 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_func_compliance_condicoes_tenant_insert','trg_func_compliance_condicoes_tenant_update','trg_treinamento_requisitos_condicao_tenant_insert','trg_treinamento_requisitos_condicao_tenant_update');"
assert_count costa-do-sol-condition-catalog 24 "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL;"
assert_count no-inferred-employee-assignments 0 "SELECT COUNT(*) count FROM funcionarios_compliance_condicoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL;"
echo TRAINING_COMPLIANCE_CONDITIONS_0517_STAGING_POSTCONDITIONS=PASS
