#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="training-compliance-conditions-0517"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0517 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count conditions-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='compliance_condicoes';"
assert_count assignments-table 1 "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='funcionarios_compliance_condicoes';"
for column in condicao_id justificativa perfil_competencia modalidade_requerida fundamento_tipo fundamento_documento fundamento_item validade_fonte; do
  assert_count "requirements-column-$column" 1 "SELECT COUNT(*) count FROM pragma_table_info('treinamento_requisitos') WHERE name='$column';"
done
assert_count condition-tenant-triggers 4 "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name IN ('trg_func_compliance_condicoes_tenant_insert','trg_func_compliance_condicoes_tenant_update','trg_treinamento_requisitos_condicao_tenant_insert','trg_treinamento_requisitos_condicao_tenant_update');"
tenant6="$(query_count "SELECT COUNT(*) count FROM empresas WHERE id=6;")"; expected=$((tenant6*24))
assert_count initial-condition-catalog "$expected" "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL;"
assert_count cross-tenant-assignments 0 "SELECT COUNT(*) count FROM funcionarios_compliance_condicoes a JOIN funcionarios f ON f.id=a.funcionario_id JOIN compliance_condicoes c ON c.id=a.condicao_id WHERE a.empresa_id<>f.empresa_id OR a.empresa_id<>c.empresa_id;"
assert_count cross-tenant-rule-condition 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN compliance_condicoes c ON c.id=tr.condicao_id WHERE tr.condicao_id IS NOT NULL AND tr.empresa_id<>c.empresa_id;"
echo TRAINING_COMPLIANCE_CONDITIONS_0517_PRODUCTION_POSTCONDITIONS=PASS
