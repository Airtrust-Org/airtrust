#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
target=airtrust-db
for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "UNKNOWN_ARGUMENT" >&2; exit 1 ;;
  esac
done
[[ "$target" == airtrust-db ]] || { echo "PRODUCTION_DB_MISMATCH" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),v=Number(d[0]?.results?.[0]?.count);if(!Number.isSafeInteger(v)||v<0)process.exit(1);console.log(v);})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" actual; actual="$(query_count "$sql")"; [[ "$actual" == "$expected" ]] || { echo "POSTCHECK_FAILED: $name expected=$expected got=$actual" >&2; exit 1; }; echo "CHECK_OK=$name"; }
assert_count applied-0549 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='fdm-tripulacao-model-consolidation-0549' AND baseline_id='production-d1-baseline-v2-20260714';"
assert_count retired-source-model 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='FDM-TRIPULACAO' AND ativo=0 AND deleted_at IS NOT NULL;"
assert_count source-active-history 0 "SELECT COUNT(*) count FROM qualificacoes_historico h JOIN qualificacoes_tipos q ON q.id=h.qualificacao_id AND q.empresa_id=h.empresa_id WHERE h.empresa_id=6 AND h.deleted_at IS NULL AND q.codigo='FDM-TRIPULACAO';"
assert_count target-history 9 "SELECT COUNT(*) count FROM qualificacoes_historico h JOIN qualificacoes_tipos q ON q.id=h.qualificacao_id AND q.empresa_id=h.empresa_id WHERE h.empresa_id=6 AND h.deleted_at IS NULL AND q.codigo='FDM_TRIP';"
assert_count course-71-target 1 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos q ON q.id=c.qualificacao_tipo_id AND q.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND c.id=71 AND c.ativo=1 AND c.publicado=1 AND c.deleted_at IS NULL AND q.codigo='FDM_TRIP';"
assert_count course-71-enrolments 11 "SELECT COUNT(*) count FROM lms_matriculas WHERE empresa_id=6 AND curso_id=71 AND deleted_at IS NULL;"
assert_count course-71-completed 9 "SELECT COUNT(*) count FROM lms_matriculas WHERE empresa_id=6 AND curso_id=71 AND deleted_at IS NULL AND status='CONCLUIDO';"
assert_count course-71-open 2 "SELECT COUNT(*) count FROM lms_matriculas WHERE empresa_id=6 AND curso_id=71 AND deleted_at IS NULL AND status<>'CONCLUIDO';"
assert_count target-requirements 2 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos q ON q.id=tr.qualificacao_tipo_id AND q.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND tr.ativo=1 AND tr.deleted_at IS NULL AND q.codigo='FDM_TRIP';"
assert_count source-requirements 0 "SELECT COUNT(*) count FROM treinamento_requisitos tr JOIN qualificacoes_tipos q ON q.id=tr.qualificacao_tipo_id AND q.empresa_id=tr.empresa_id WHERE tr.empresa_id=6 AND tr.ativo=1 AND tr.deleted_at IS NULL AND q.codigo='FDM-TRIPULACAO';"
assert_count unchanged-empty-course-74 1 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos q ON q.id=c.qualificacao_tipo_id AND q.empresa_id=c.empresa_id WHERE c.empresa_id=6 AND c.id=74 AND c.ativo=1 AND c.publicado=0 AND c.deleted_at IS NULL AND q.codigo='FDM_TRIP';"
assert_count course-74-enrolments 0 "SELECT COUNT(*) count FROM lms_matriculas WHERE empresa_id=6 AND curso_id=74 AND deleted_at IS NULL;"
echo FDM_TRIPULACAO_MODEL_CONSOLIDATION_0549_PRODUCTION_POSTCONDITIONS=PASS
