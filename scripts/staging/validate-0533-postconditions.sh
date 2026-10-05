#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0533 postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env staging --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
assert_count qualificacoes-referencias-present 1 "SELECT COUNT(*) count FROM pragma_table_info('qualificacoes_tipos') WHERE name='referencias';"
assert_count lms-referencias-present 1 "SELECT COUNT(*) count FROM pragma_table_info('lms_cursos') WHERE name='referencias';"
assert_count probe-marker-removed 0 "SELECT COUNT(*) count FROM lms_cursos WHERE empresa_id=6 AND COALESCE(observacoes,'') LIKE 'ssot-probe-curl-%';"
pt6c_total="$(query_count "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PT6C-67C' AND ativo=1 AND deleted_at IS NULL;")"
if [[ "$pt6c_total" == "0" ]]; then
  echo "POSTCONDITION_NOT_APPLICABLE=pt6c-hours:model-absent-in-staging"
else
  [[ "$pt6c_total" == "1" ]] || { echo "ERROR: pt6c-model-count expected=1 found=$pt6c_total" >&2; exit 1; }
  assert_count pt6c-hours 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(TRIM(codigo))='PT6C-67C' AND carga_horaria_inicial=16 AND carga_horaria_recorrente=8 AND ativo=1 AND deleted_at IS NULL;"
fi
assert_count nr35-non-presencial-rules 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND UPPER(qt.codigo)='NR-35' AND tr.ativo=1 AND tr.deleted_at IS NULL AND (COALESCE(UPPER(TRIM(tr.modalidade_requerida)),'')<>'PRESENCIAL' OR COALESCE(tr.auto_matricular_ead,0)<>0);"
assert_count nr20-non-hybrid-rules 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND UPPER(qt.codigo)='NR-20' AND tr.ativo=1 AND tr.deleted_at IS NULL AND (COALESCE(UPPER(TRIM(tr.modalidade_requerida)),'')<>'HIBRIDO' OR COALESCE(tr.auto_matricular_ead,0)<>0);"
assert_count nr20-nr35-autoqual 0 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND UPPER(qt.codigo) IN ('NR-20','NR-35') AND c.gerar_qualificacao_ao_concluir<>0 AND c.deleted_at IS NULL;"
assert_count lgpd-not-qsms 0 "SELECT COUNT(*) count FROM qualificacoes_tipos qt LEFT JOIN qualificacoes_areas qa ON qa.id=qt.area_id AND qa.empresa_id=qt.empresa_id WHERE qt.empresa_id=6 AND UPPER(qt.codigo)='LGPD' AND UPPER(COALESCE(qa.nome,''))<>'QSMS' AND qt.ativo=1 AND qt.deleted_at IS NULL;"
echo TRAINING_CATALOG_METADATA_REFERENCES_0533_STAGING_POSTCONDITIONS=PASS
