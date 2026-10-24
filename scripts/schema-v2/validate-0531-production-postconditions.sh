#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="training-compliance-nr20-modality-repair-0531"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0531 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
TARGET_NAMES="'Mecânico','Mecanico','MECÂNICO','MECANICO','Aux Manutenção','Aux Manutencao','AUX MANUTENÇÃO','AUX MANUTENCAO','Auxiliar de Manutenção','Auxiliar de Manutencao','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO','Aux Suprimentos','Auxiliar de Suprimentos','Supervisor Suprimentos','Supervisor de Suprimentos'"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID' AND baseline_id='$BASELINE_ID';"
assert_count target-functions 4 "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND TRIM(nome) IN ($TARGET_NAMES);"
assert_count target-requirements 4 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id JOIN funcoes f ON f.id=tr.funcao_id AND f.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND UPPER(qt.codigo)='NR-20' AND tr.escopo='FUNCAO' AND tr.ativo=1 AND tr.deleted_at IS NULL AND f.ativo=1 AND f.deleted_at IS NULL AND TRIM(f.nome) IN ($TARGET_NAMES);"
assert_count target-nonhybrid 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id JOIN funcoes f ON f.id=tr.funcao_id AND f.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND UPPER(qt.codigo)='NR-20' AND tr.escopo='FUNCAO' AND tr.ativo=1 AND tr.deleted_at IS NULL AND f.ativo=1 AND f.deleted_at IS NULL AND TRIM(f.nome) IN ($TARGET_NAMES) AND COALESCE(UPPER(TRIM(tr.modalidade_requerida)),'')<>'HIBRIDO';"
bash scripts/schema-v2/validate-0526-production-postconditions.sh --target="$target"
echo TRAINING_COMPLIANCE_NR20_MODALITY_REPAIR_0531_PRODUCTION_POSTCONDITIONS=PASS
