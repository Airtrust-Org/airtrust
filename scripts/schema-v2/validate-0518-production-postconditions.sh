#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; CHANGE_ID="crm-qualification-consolidation-0518"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0518 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count crm-corp-canonical 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='CRM_CORP' AND nome='CRM Corporate' AND validade=24 AND carga_horaria_inicial=16 AND carga_horaria_recorrente=16 AND ativo=1 AND deleted_at IS NULL;"
assert_count tripulantes-preserved 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='D3' AND nome='CRM — Tripulantes' AND validade=12 AND ativo=1 AND deleted_at IS NULL;"
assert_count crm-corp-tripulacao-nao-aplica 1 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id JOIN setores s ON s.id=tr.setor_id AND s.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND qt.codigo='CRM_CORP' AND tr.escopo='SETOR' AND s.codigo='TRI' AND tr.obrigatoriedade='NAO_APLICA' AND tr.ativo=1 AND tr.deleted_at IS NULL;"
assert_count retired-active-models 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM') AND deleted_at IS NULL;"
assert_count retired-history-ref 0 "SELECT COUNT(*) count FROM qualificacoes_historico qh JOIN qualificacoes_tipos qt ON qt.id=qh.qualificacao_id WHERE qh.empresa_id=6 AND qt.empresa_id=6 AND qt.codigo='MNT_FATORES_HUMANOS_CRM';"
assert_count retired-active-requirements 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id WHERE tr.empresa_id=6 AND tr.ativo=1 AND tr.deleted_at IS NULL AND qt.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM');"
assert_count retired-active-sector-links 0 "SELECT COUNT(*) count FROM qualificacoes_tipos_setores qts JOIN qualificacoes_tipos qt ON qt.id=qts.tipo_id WHERE qts.empresa_id=6 AND qts.deleted_at IS NULL AND qt.codigo IN ('CRM-LOS-T','CRM-LOS-P','MNT_FATORES_HUMANOS_CRM');"
assert_count retired-planned-ref 0 "SELECT COUNT(*) count FROM treinamentos_planejados tp JOIN qualificacoes_tipos qt ON qt.id=tp.qualificacao_tipo_id WHERE tp.empresa_id=6 AND qt.codigo='MNT_FATORES_HUMANOS_CRM';"
active_sectors="$(query_count "SELECT COUNT(*) count FROM setores WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL;")"
assert_count crm-corp-all-active-sectors "$active_sectors" "SELECT COUNT(*) count FROM qualificacoes_tipos_setores qts JOIN qualificacoes_tipos qt ON qt.id=qts.tipo_id WHERE qts.empresa_id=6 AND qts.deleted_at IS NULL AND qt.codigo='CRM_CORP';"
echo CRM_QUALIFICATION_CONSOLIDATION_0518_PRODUCTION_POSTCONDITIONS=PASS
