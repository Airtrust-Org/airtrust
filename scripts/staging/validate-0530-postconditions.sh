#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"; target=""
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: staging 0530 postconditions refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "POSTCONDITION_OK=$label"; }
CODES="'REGRAS_OURO_PETROBRAS','JUST_CULTURE','STOP_WORK','ETICA_CONDUTA','LGPD_SEG_INFO'"
MARKER="Modelo criado em 2026-10-04;%"
assert_count migration-ledger-0530 1 "SELECT COUNT(*) count FROM d1_migrations WHERE name='0530_training_qualification_catalog_placeholders.sql';"
assert_count qualification-models 5 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(codigo) IN ($CODES);"
assert_count duplicate-active-target-models 0 "SELECT COUNT(*) count FROM (SELECT UPPER(codigo) code,COUNT(*) n FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(codigo) IN ($CODES) GROUP BY UPPER(codigo) HAVING COUNT(*)>1);"
assert_count created-by-0530-invalid-category 0 "SELECT COUNT(*) count FROM qualificacoes_tipos qt LEFT JOIN qualificacoes_categorias qc ON qc.id=qt.categoria_id AND qc.empresa_id=qt.empresa_id WHERE qt.empresa_id=6 AND qt.ativo=1 AND qt.deleted_at IS NULL AND UPPER(qt.codigo) IN ($CODES) AND COALESCE(qt.observacoes,'') LIKE '$MARKER' AND (qc.id IS NULL OR qc.ativo<>1 OR qc.deleted_at IS NOT NULL OR UPPER(TRIM(qc.codigo))<>'EAD');"
assert_count created-by-0530-invented-validity-hours 0 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND ativo=1 AND deleted_at IS NULL AND UPPER(codigo) IN ($CODES) AND COALESCE(observacoes,'') LIKE '$MARKER' AND (validade IS NOT NULL OR carga_horaria IS NOT NULL);"
assert_count created-by-0530-compliance-requirements 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos qt ON qt.id=tr.qualificacao_tipo_id AND qt.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND tr.ativo=1 AND tr.deleted_at IS NULL AND UPPER(qt.codigo) IN ($CODES) AND COALESCE(qt.observacoes,'') LIKE '$MARKER';"
assert_count created-by-0530-lms-courses 0 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND c.deleted_at IS NULL AND UPPER(qt.codigo) IN ($CODES) AND COALESCE(qt.observacoes,'') LIKE '$MARKER';"
echo TRAINING_QUALIFICATION_CATALOG_0530_STAGING_POSTCONDITIONS=PASS
