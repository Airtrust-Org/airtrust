#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="training-qualification-catalog-placeholders-0530"
target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0530 production postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
CODES="'REGRAS_OURO_PETROBRAS','JUST_CULTURE','STOP_WORK','ETICA_CONDUTA','LGPD_SEG_INFO'"
assert_count schema-v2-change 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID' AND baseline_id='$BASELINE_ID';"
assert_count qualification-models 5 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(codigo) IN ($CODES);"
assert_count canonical-ead-binding 5 "SELECT COUNT(*) count FROM qualificacoes_tipos qt JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=qt.empresa_id WHERE qt.empresa_id=6 AND qt.ativo=1 AND qt.deleted_at IS NULL AND UPPER(qt.codigo) IN ($CODES) AND qc.ativo=1 AND qc.deleted_at IS NULL AND UPPER(TRIM(qc.codigo))='EAD';"
assert_count duplicate-active-target-models 0 "SELECT COUNT(*) count FROM (SELECT UPPER(codigo) code,COUNT(*) n FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(codigo) IN ($CODES) GROUP BY UPPER(codigo) HAVING COUNT(*)>1);"
assert_count no-compliance-requirements 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND tr.ativo=1 AND tr.deleted_at IS NULL AND UPPER(qt.codigo) IN ($CODES);"
assert_count no-lms-courses 0 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND c.deleted_at IS NULL AND UPPER(qt.codigo) IN ($CODES);"
echo TRAINING_QUALIFICATION_CATALOG_0530_PRODUCTION_POSTCONDITIONS=PASS
