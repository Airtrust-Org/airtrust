#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"; cd "$ROOT"
ALLOWED_DB_NAME="airtrust-db"; target="$ALLOWED_DB_NAME"
for arg in "$@"; do case "$arg" in --target=*) target="${arg#*=}" ;; *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;; esac; done
[[ "$target" == "$ALLOWED_DB_NAME" ]] || { echo "ERROR: 0541 refused non-airtrust-db target" >&2; exit 1; }
query_count(){ local sql="$1"; (cd worker-airtrust && npx wrangler d1 execute "$target" --env production --remote --json --command "$sql") | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const s=d.indexOf('['),e=d.lastIndexOf(']');const p=JSON.parse(s>=0?d.slice(s,e+1):d);const r=p[0]?.results?.[0]||{};const n=Number(r.count??r.total??Object.values(r)[0]??NaN);if(!Number.isInteger(n)||n<0)process.exit(1);console.log(n)})"; }
assert_count(){ local label="$1" expected="$2" sql="$3" count; count="$(query_count "$sql")"; [[ "$count" == "$expected" ]] || { echo "ERROR: $label expected=$expected found=$count" >&2; exit 1; }; echo "CHECK_OK=$label"; }
assert_count schema-v2-0541 1 "SELECT COUNT(*) count FROM airtrust_schema_changes_v2 WHERE change_id='training-operational-category-bootstrap-0541' AND baseline_id='production-d1-baseline-v2-20260714';"
assert_count category-canonical 1 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND codigo='TREINAMENTO_OPERACIONAL' AND nome='Treinamentos Operacionais' AND cor='#6B7280' AND ativo=1 AND deleted_at IS NULL AND lms_integrada=0 AND dominio_codigo IS NULL;"
assert_count category-identity-total 1 "SELECT COUNT(*) count FROM qualificacoes_categorias WHERE empresa_id=6 AND (UPPER(TRIM(codigo))='TREINAMENTO_OPERACIONAL' OR UPPER(TRIM(nome))='TREINAMENTOS OPERACIONAIS');"
echo TRAINING_OPERATIONAL_CATEGORY_0541_PRODUCTION_POSTCONDITIONS=PASS
