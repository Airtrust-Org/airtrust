#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="training-compliance-governed-designation-rules-0523"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0523 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
RBAC_CODES="'RBAC119_GESTOR_RESPONSAVEL','RBAC119_GERENTE_OPERACOES','RBAC119_PILOTO_CHEFE','RBAC119_GERENTE_MANUTENCAO','RBAC119_GERENTE_SEGURANCA_OPERACIONAL'"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID' AND baseline_id='$BASELINE_ID';"
assert_count crm-dir-governed-rules 5 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_DIR_RBAC119' AND cc.codigo IN ($RBAC_CODES) AND tr.obrigatoriedade='OBRIGATORIA' AND tr.origem='REGULATORIO' AND tr.fundamento_tipo='DESIGNACAO' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count crm-corp-governed-exclusions 5 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND cc.codigo IN ($RBAC_CODES) AND tr.obrigatoriedade='NAO_APLICA' AND tr.origem='REGULATORIO' AND tr.fundamento_tipo='PADRAO_EXCLUSAO' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count crm-corp-company-rule 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND tr.escopo='EMPRESA' AND tr.condicao_id IS NULL AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
echo TRAINING_COMPLIANCE_GOVERNED_DESIGNATION_RULES_0523_PRODUCTION_POSTCONDITIONS=PASS
