#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="training-compliance-requirement-sanitization-0524"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0524 production preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count unapplied-change 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count dependency-0517 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-conditions-0517';"
assert_count dependency-0518 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='crm-qualification-consolidation-0518';"
assert_count dependency-0521 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-designation-overrides-0521';"
assert_count dependency-0523 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-compliance-governed-designation-rules-0523';"
assert_count required-models 3 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('FDM-EAD','MNT_AW139','MNT_S76AC') AND ativo=1 AND deleted_at IS NULL;"
assert_count required-maintenance-functions 2 "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND nome IN ('Mecânico','Auxiliar de Manutenção') AND ativo=1 AND deleted_at IS NULL;"
assert_count crm-company-rule 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND tr.escopo='EMPRESA' AND tr.condicao_id IS NULL AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count governed-rbac119-exclusions 5 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN compliance_condicoes cc ON cc.id=tr.condicao_id AND cc.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND cc.codigo LIKE 'RBAC119_%' AND tr.obrigatoriedade='NAO_APLICA' AND tr.origem='REGULATORIO' AND tr.fundamento_tipo='PADRAO_EXCLUSAO' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
echo TRAINING_COMPLIANCE_REQUIREMENT_SANITIZATION_0524_PRODUCTION_PREFLIGHT=PASS