#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; CHANGE_ID="training-compliance-designation-overrides-0521"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0521 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count rbac119-designations 5 "SELECT COUNT(*) count FROM compliance_condicoes WHERE empresa_id=6 AND codigo LIKE 'RBAC119_%' AND tipo='DESIGNACAO' AND ativo=1 AND deleted_at IS NULL;"
assert_count crm-dir-designation-rules 5 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_DIR_RBAC119' AND tr.condicao_id IN (SELECT id FROM compliance_condicoes WHERE empresa_id=6 AND codigo LIKE 'RBAC119_%') AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count crm-corp-exclusion-rules 5 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND tr.condicao_id IN (SELECT id FROM compliance_condicoes WHERE empresa_id=6 AND codigo LIKE 'RBAC119_%') AND tr.obrigatoriedade='NAO_APLICA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count no-inferred-assignments 0 "SELECT COUNT(*) count FROM funcionarios_compliance_condicoes fcc JOIN compliance_condicoes cc ON cc.id=fcc.condicao_id AND cc.empresa_id=fcc.empresa_id WHERE fcc.empresa_id=6 AND cc.codigo LIKE 'RBAC119_%' AND fcc.ativo=1 AND fcc.deleted_at IS NULL;"
echo TRAINING_COMPLIANCE_DESIGNATION_OVERRIDES_0521_PRODUCTION_POSTCONDITIONS=PASS
