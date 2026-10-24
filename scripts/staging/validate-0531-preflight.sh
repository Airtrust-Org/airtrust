#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0531 preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env staging --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
TARGET_NAMES="'Mecânico','Mecanico','MECÂNICO','MECANICO','Aux Manutenção','Aux Manutencao','AUX MANUTENÇÃO','AUX MANUTENCAO','Auxiliar de Manutenção','Auxiliar de Manutencao','AUXILIAR DE MANUTENÇÃO','AUXILIAR DE MANUTENCAO','Aux Suprimentos','Auxiliar de Suprimentos','Supervisor Suprimentos','Supervisor de Suprimentos'"
assert_count migration-ledger-0526 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0526_training_compliance_matrix_alignment.sql';"
assert_count migration-ledger-0531-absent 0 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0531_training_compliance_nr20_modality_repair.sql';"
assert_count nr20-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='NR-20' AND ativo=1 AND deleted_at IS NULL AND validade=24 AND carga_horaria_inicial=16 AND carga_horaria_recorrente=4;"
assert_count target-functions 4 "SELECT COUNT(*) count FROM funcoes WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND TRIM(nome) IN ($TARGET_NAMES);"
assert_count target-requirements 4 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id JOIN funcoes f ON f.id=tr.funcao_id AND f.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND UPPER(qt.codigo)='NR-20' AND tr.escopo='FUNCAO' AND tr.ativo=1 AND tr.deleted_at IS NULL AND f.ativo=1 AND f.deleted_at IS NULL AND TRIM(f.nome) IN ($TARGET_NAMES);"
assert_count target-nonhybrid 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id JOIN funcoes f ON f.id=tr.funcao_id AND f.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND UPPER(qt.codigo)='NR-20' AND tr.escopo='FUNCAO' AND tr.ativo=1 AND tr.deleted_at IS NULL AND f.ativo=1 AND f.deleted_at IS NULL AND TRIM(f.nome) IN ($TARGET_NAMES) AND COALESCE(UPPER(TRIM(tr.modalidade_requerida)),'')<>'HIBRIDO';"
echo TRAINING_COMPLIANCE_NR20_MODALITY_REPAIR_0531_STAGING_PREFLIGHT=PASS
