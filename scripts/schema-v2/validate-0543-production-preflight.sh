#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
target=airtrust-db
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "UNKNOWN_ARGUMENT" >&2; exit 1 ;; esac; done
[[ "$target" == airtrust-db ]] || { echo "PRODUCTION_DB_MISMATCH" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const a=s.indexOf('['),z=s.lastIndexOf(']'),d=JSON.parse(a>=0?s.slice(a,z+1):s),v=Number(d[0]?.results?.[0]?.count); if(!Number.isSafeInteger(v)||v<0)process.exit(1);console.log(v);})"; }
assert_count(){ local name="$1" expected="$2" sql="$3" n; n="$(query_count "$sql")"; [[ "$n" == "$expected" ]] || { echo "PREPOST_FAILED: $name expected=$expected got=$n" >&2; exit 1; }; echo "CHECK_OK=$name"; }

assert_count active-v2-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE';"
assert_count applied-0536-and-0541 2 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id IN ('training-compliance-fdm-three-audiences-0536','training-operational-category-bootstrap-0541') AND baseline_id='production-d1-baseline-v2-20260714';"
assert_count unapplied-0543 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='fdm-target-qualification-links-0543';"
assert_count tenant-6 1 "SELECT COUNT(*) count FROM empresas WHERE id=6;"
assert_count unique-qualification-tripulacao 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='FDM-TRIPULACAO' AND ativo=1 AND deleted_at IS NULL;"
assert_count unique-qualification-manutencao 1 "SELECT COUNT(*) count FROM qualificacoes_tipos WHERE empresa_id=6 AND codigo='FDM-MECANICO' AND ativo=1 AND deleted_at IS NULL;"
assert_count exact-active-scorm-courses 2 "SELECT COUNT(*) count FROM lms_cursos WHERE empresa_id=6 AND id IN (71,72) AND ativo=1 AND publicado=1 AND deleted_at IS NULL AND LOWER(tipo_conteudo)='scorm' AND scorm_package_r2_prefix IS NOT NULL AND scorm_launch_file IS NOT NULL;"
assert_count destination-enrollments-absent 0 "SELECT COUNT(*) count FROM lms_matriculas WHERE empresa_id=6 AND curso_id IN (71,72);"
assert_count bindings-both-need-fix 2 "SELECT COUNT(*) count FROM lms_cursos c JOIN qualificacoes_tipos qt ON qt.empresa_id=c.empresa_id AND qt.codigo=CASE c.id WHEN 71 THEN 'FDM-TRIPULACAO' WHEN 72 THEN 'FDM-MECANICO' END AND qt.ativo=1 AND qt.deleted_at IS NULL WHERE c.empresa_id=6 AND c.id IN (71,72) AND COALESCE(c.qualificacao_tipo_id,-1)!=qt.id;"
echo FDM_TARGET_BINDINGS_0543_PRODUCTION_PREFLIGHT=PASS
