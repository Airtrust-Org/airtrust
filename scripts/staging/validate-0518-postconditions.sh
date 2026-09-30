#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0518 validator refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count migration-ledger-0518 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0518_crm_qualification_consolidation.sql';"
assert_count crm-corp-canonical 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='CRM_CORP' AND nome='CRM Corporate' AND validade=24 AND ativo=1 AND deleted_at IS NULL;"
assert_count crm-corp-tripulacao-nao-aplica 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN setores s ON s.id=tr.setor_id AND s.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND tr.escopo='SETOR' AND s.codigo='TRI' AND tr.obrigatoriedade='NAO_APLICA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count retired-active-models 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM') AND deleted_at IS NULL;"
assert_count tripulantes-preserved 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='D3' AND ativo=1 AND deleted_at IS NULL;"
assert_count crm-corp-active-duplicate-groups 0 "SELECT COUNT(*) count FROM (SELECT qh.funcionario_id,qh.data_conclusao FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id WHERE qh.empresa_id=6 AND qh.deleted_at IS NULL AND qt.empresa_id=6 AND qt.codigo='CRM_CORP' GROUP BY qh.funcionario_id,qh.data_conclusao HAVING COUNT(*)>1);"
echo CRM_QUALIFICATION_CONSOLIDATION_0518_STAGING_POSTCONDITIONS=PASS
