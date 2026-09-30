#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="crm-qualification-consolidation-0518"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0518 production preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count unapplied-change 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
for code in D3 CRM_CORP MNT_FATORES_HUMANOS_CRM CRM-LOS-T CRM-LOS-P; do assert_count "active-$code" 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='$code' AND ativo=1 AND deleted_at IS NULL;"; done
assert_count crm-dir-rbac119-absent 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='CRM_DIR_RBAC119' AND deleted_at IS NULL;"
assert_count ead-format 1 "SELECT COUNT(*) count FROM qualificacoes_formatos WHERE empresa_id=6 AND codigo='EAD' AND ativo=1 AND deleted_at IS NULL;"
assert_count ead-category 1 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='EAD' AND ativo=1 AND deleted_at IS NULL;"
assert_count safety-area 1 "SELECT COUNT(*) count FROM qualificacoes_areas WHERE empresa_id=6 AND codigo='SEGURANCA_OPERACIONAL' AND ativo=1 AND deleted_at IS NULL;"
assert_count crm-corp-company-rule 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND tr.escopo='EMPRESA' AND tr.obrigatoriedade='OBRIGATORIA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count crm-corp-tripulacao-override-absent 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN setores s ON s.id=tr.setor_id AND s.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND tr.escopo='SETOR' AND s.codigo='TRI' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count los-history-zero 0 "SELECT COUNT(*) count FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id WHERE qh.empresa_id=6 AND qt.empresa_id=6 AND qt.codigo IN ('CRM-LOS-T','CRM-LOS-P');"
assert_count unexpected-lms-ref 0 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id WHERE c.empresa_id=6 AND c.deleted_at IS NULL AND qt.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM');"
assert_count unexpected-matrix-ref 0 "SELECT COUNT(*) count FROM matriz_treinamento_funcao m JOIN qualificacoes_tipos qt ON qt.id=m.qualificacao_tipo_id WHERE m.empresa_id=6 AND m.deleted_at IS NULL AND qt.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM');"
assert_count unexpected-model-ref 0 "SELECT COUNT(*) count FROM modelos_sessao m JOIN qualificacoes_tipos qt ON qt.id=m.qualificacao_tipo_id WHERE m.deleted_at IS NULL AND qt.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM');"
assert_count unexpected-model-check-ref 0 "SELECT COUNT(*) count FROM modelos_sessao_checks m JOIN qualificacoes_tipos qt ON qt.id=m.qualificacao_tipo_id WHERE m.deleted_at IS NULL AND qt.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM');"
assert_count unexpected-session-check-ref 0 "SELECT COUNT(*) count FROM sessoes_checks s JOIN qualificacoes_tipos qt ON qt.id=s.qualificacao_tipo_id WHERE s.deleted_at IS NULL AND qt.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM');"
assert_count unexpected-program-ref 0 "SELECT COUNT(*) count FROM treinamento_programas p JOIN qualificacoes_tipos qt ON qt.id=p.qualificacao_tipo_id WHERE p.empresa_id=6 AND p.deleted_at IS NULL AND qt.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM');"
assert_count unexpected-dependency-ref 0 "SELECT COUNT(*) count FROM treinamento_dependencias d JOIN qualificacoes_tipos qo ON qo.id=d.qualificacao_origem_id JOIN qualificacoes_tipos qd ON qd.id=d.qualificacao_destino_id WHERE d.empresa_id=6 AND d.deleted_at IS NULL AND (qo.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM') OR qd.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM'));"
assert_count unexpected-certificate-ref 0 "SELECT COUNT(*) count FROM certificados c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_id WHERE qt.empresa_id=6 AND qt.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM');"
assert_count unexpected-request-ref 0 "SELECT COUNT(*) count FROM solicitacoes_treinamento s JOIN qualificacoes_tipos qt ON qt.id=s.qualificacao_id WHERE s.empresa_id=6 AND qt.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM');"

# Duplicate CRM rows are intentionally consolidated by 0518. Refuse the apply if a row
# that may be soft-deleted has become linked to an operational workflow that 0518 does not rewrite.
DUP_EXISTS="EXISTS (SELECT 1 FROM qualificacoes_historico q2 WHERE q2.empresa_id=qh.empresa_id AND q2.deleted_at IS NULL AND q2.funcionario_id=qh.funcionario_id AND q2.data_conclusao=qh.data_conclusao AND q2.id<>qh.id AND q2.qualificacao_id IN (SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('CRM_CORP','MNT_FATORES_HUMANOS_CRM')))"
CRM_SCOPE="qh.empresa_id=6 AND qh.deleted_at IS NULL AND qh.qualificacao_id IN (SELECT id FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('CRM_CORP','MNT_FATORES_HUMANOS_CRM'))"
assert_count duplicate-lms-matricula-ref 0 "SELECT COUNT(*) count FROM lms_matriculas x JOIN qualificacoes_historico qh ON qh.id=x.qualificacao_historico_id WHERE x.empresa_id=6 AND $CRM_SCOPE AND $DUP_EXISTS;"
assert_count duplicate-lms-ciclo-ref 0 "SELECT COUNT(*) count FROM lms_matricula_ciclos x JOIN qualificacoes_historico qh ON qh.id=x.qualificacao_historico_id WHERE x.empresa_id=6 AND x.deleted_at IS NULL AND $CRM_SCOPE AND $DUP_EXISTS;"
assert_count duplicate-renovacao-request-ref 0 "SELECT COUNT(*) count FROM qualificacoes_renovacoes x JOIN qualificacoes_historico qh ON qh.id=x.qualificacao_historico_id WHERE x.deleted_at IS NULL AND $CRM_SCOPE AND $DUP_EXISTS;"
assert_count duplicate-training-generated-ref 0 "SELECT COUNT(*) count FROM treinamentos_qualificacoes_geradas x JOIN qualificacoes_historico qh ON qh.id=x.qualificacao_historico_id WHERE x.empresa_id=6 AND $CRM_SCOPE AND $DUP_EXISTS;"
echo CRM_QUALIFICATION_CONSOLIDATION_0518_PRODUCTION_PREFLIGHT=PASS
