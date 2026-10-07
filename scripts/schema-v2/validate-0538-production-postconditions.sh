#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: production 0538 postcondition refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count schema-v2-0538 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-manager-designation-nr05-0538' AND baseline_id='production-d1-baseline-v2-20260714';"
assert_count gestor-designation 1 "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND codigo='GESTOR' AND nome='Gestor' AND tipo='DESIGNACAO' AND ativo=1 AND deleted_at IS NULL;"
assert_count gestor-training-rules 2 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo IN ('PPSP_SUP','BOWTIEXP') AND cc.codigo='GESTOR' AND tr.escopo='EMPRESA' AND tr.obrigatoriedade='OBRIGATORIA' AND tr.auto_matricular_ead=1 AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count gestor-title-rules 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo IN ('PPSP_SUP','BOWTIEXP') AND tr.escopo='FUNCAO' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count nr05-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='NR-05' AND categoria='EAD' AND validade=24 AND carga_horaria=2 AND ativo=1 AND deleted_at IS NULL;"
assert_count nr05-company-rule 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='NR-05' AND tr.escopo='EMPRESA' AND tr.condicao_id IS NULL AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
echo TRAINING_COMPLIANCE_MANAGER_DESIGNATION_NR05_0538_PRODUCTION_POSTCONDITIONS=PASS
