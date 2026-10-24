#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0542 refused invalid target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=d.indexOf('['),e=d.lastIndexOf(']');const p=JSON.parse(s>=0?d.slice(s,e+1):d);const r=p[0]?.results?.[0]||{};const n=Number(r.count??r.total??Object.values(r)[0]??NaN);if(!Number.isInteger(n)||n<0)process.exit(1);console.log(n)})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" actual; actual="$(query_count "$sql")"; [[ "$actual" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$actual" >&2; exit 1; }; echo "CHECK_OK=$label"; }
assert_count column-absent 0 "SELECT COUNT(*) count FROM pragma_table_info('lms_cursos') WHERE name='scorm_assessment_policy';"
assert_count policy-0542-unapplied 0 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='lms-scorm-formative-assessment-0542';"
assert_count tenant-six 1 "SELECT COUNT(*) count FROM empresas WHERE id=6;"
assert_count active-baseline 1 "SELECT COUNT(*) count FROM airtrust_schema_baselines_v2 WHERE baseline_id='production-d1-baseline-v2-20260714' AND status='ACTIVE';"
assert_count exactly-one-formative-crm 1 "SELECT COUNT(*) count FROM lms_cursos WHERE empresa_id=6 AND tipo_conteudo='scorm' AND deleted_at IS NULL AND TRIM(titulo) IN ('CRM — Gestores — Cargos de Direção Requeridos (RBAC 119)','CRM para Gestores — Cargos de Direção Requeridos (RBAC 119)');"
assert_count incident-matricula-course-863 1 "SELECT COUNT(*) count FROM lms_matriculas m JOIN lms_cursos c ON c.id=m.curso_id AND c.empresa_id=m.empresa_id WHERE m.id=863 AND m.empresa_id=6 AND m.deleted_at IS NULL AND c.tipo_conteudo='scorm' AND TRIM(titulo) IN ('CRM — Gestores — Cargos de Direção Requeridos (RBAC 119)','CRM para Gestores — Cargos de Direção Requeridos (RBAC 119)');"
echo LMS_SCORM_FORMATIVE_0542_PRODUCTION_PRECONDITIONS=PASS
