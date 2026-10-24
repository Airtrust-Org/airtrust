#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; BASELINE_ID="production-d1-baseline-v2-20260714"; CHANGE_ID="training-catalog-metadata-references-0533"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0533 production preflight refused target: $target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const p=JSON.parse(d);const r=p[0]?.results?.[0]||{};console.log(Number(r.count??r.total??Object.values(r)[0]??0))})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "PREFLIGHT_OK=$label"; }
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='$BASELINE_ID' AND status='ACTIVE';"
assert_count unapplied-change 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='$CHANGE_ID';"
assert_count qualificacoes-referencias-absent 0 "SELECT COUNT(*) count FROM pragma_table_info('qualificacoes_tipos') WHERE name='referencias';"
assert_count lms-referencias-absent 0 "SELECT COUNT(*) count FROM pragma_table_info('lms_cursos') WHERE name='referencias';"
assert_count reviewed-lms-courses 49 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.id=c.qualificacao_tipo_id AND qt.empresa_id=c.empresa_id LEFT JOIN qualificacoes_areas qa ON qa.id=qt.area_id AND qa.empresa_id=qt.empresa_id WHERE c.empresa_id=6 AND c.ativo=1 AND c.deleted_at IS NULL AND qa.nome IN ('QSMS','Segurança Operacional','Manutenção','Operações');"
assert_count maintenance-36-models 8 "SELECT COUNT(*) count FROM qualificacoes_tipos qt JOIN qualificacoes_areas qa ON qa.id=qt.area_id AND qa.empresa_id=qt.empresa_id WHERE qt.empresa_id=6 AND qt.ativo=1 AND qt.deleted_at IS NULL AND qa.nome='Manutenção' AND qt.validade=36;"
assert_count nr20-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='NR-20' AND ativo=1 AND deleted_at IS NULL;"
assert_count nr35-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND UPPER(codigo)='NR-35' AND ativo=1 AND deleted_at IS NULL;"
assert_count qsms-area 1 "SELECT COUNT(*) count FROM qualificacoes_areas WHERE empresa_id=6 AND UPPER(TRIM(nome))='QSMS' AND ativo=1 AND deleted_at IS NULL;"
echo TRAINING_CATALOG_METADATA_REFERENCES_0533_PRODUCTION_PREFLIGHT=PASS
