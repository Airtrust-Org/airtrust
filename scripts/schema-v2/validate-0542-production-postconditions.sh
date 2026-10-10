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
assert_count column-present 1 "SELECT COUNT(*) count FROM pragma_table_info('lms_cursos') WHERE name='scorm_assessment_policy';"
assert_count policy-default-scored 0 "SELECT COUNT(*) count FROM lms_cursos WHERE scorm_assessment_policy IS NULL OR scorm_assessment_policy NOT IN ('SCORED','FORMATIVE');"
assert_count no-formative-outside-crm 0 "SELECT COUNT(*) count FROM lms_cursos WHERE scorm_assessment_policy='FORMATIVE' AND NOT (empresa_id=6 AND tipo_conteudo='scorm' AND deleted_at IS NULL AND TRIM(titulo) IN ('CRM — Gestores — Cargos de Direção Requeridos (RBAC 119)','CRM para Gestores — Cargos de Direção Requeridos (RBAC 119)'));"
assert_count no-crm-with-wrong-policy 0 "SELECT COUNT(*) count FROM lms_cursos WHERE empresa_id=6 AND tipo_conteudo='scorm' AND deleted_at IS NULL AND TRIM(titulo) IN ('CRM — Gestores — Cargos de Direção Requeridos (RBAC 119)','CRM para Gestores — Cargos de Direção Requeridos (RBAC 119)') AND (scorm_assessment_policy!='FORMATIVE' OR scorm_mastery_score IS NOT NULL);"
assert_count schema-v2-ledger 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='lms-scorm-formative-assessment-0542';"
assert_count incident-enrollment-preserved 1 "SELECT COUNT(*) count FROM lms_matriculas WHERE id=863 AND empresa_id=6 AND deleted_at IS NULL;"
echo LMS_SCORM_FORMATIVE_0542_PRODUCTION_POSTCONDITIONS=PASS
