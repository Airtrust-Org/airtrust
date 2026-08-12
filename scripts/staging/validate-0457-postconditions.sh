#!/usr/bin/env bash
# Read-only post-condition validation for
# 0457_qualification_category_lms_contract.sql.
set -euo pipefail

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
BLOCKED_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"

db_name=""
for arg in "$@"; do
  case "$arg" in
    --target=*) db_name="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg (use --target=<db_name>)" >&2; exit 1 ;;
  esac
done

if [[ -z "$db_name" || "$db_name" != "$ALLOWED_DB_NAME" ]]; then
  echo "ERROR: --target deve ser exatamente o D1 oficial de staging." >&2
  exit 1
fi
if [[ "$ALLOWED_DB_ID" == "$BLOCKED_DB_ID" ]]; then
  echo "ERROR: identificador de produção configurado por engano." >&2
  exit 1
fi

run_query() {
  (cd worker-airtrust && npx wrangler d1 execute "$db_name" --remote --json --command "$1") \
    | node -e 'let d="";process.stdin.on("data", c => d += c).on("end", () => { const x=JSON.parse(d); console.log(JSON.stringify(x[0]?.results ?? [])); })'
}

assert_json() {
  local description="$1"
  local sql="$2"
  local predicate="$3"
  local result
  result="$(run_query "$sql")"
  echo "$description: $result"
  RESULT="$result" node -e "$predicate" || { echo "FAIL: $description" >&2; return 1; }
}

fail=0
assert_json "lms_integrada column exists" "SELECT COUNT(*) AS n FROM pragma_table_info('qualificacoes_categorias') WHERE name='lms_integrada'" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1
assert_json "0457 indexes exist" "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name IN ('ux_qualificacoes_categorias_normalized_name_active','ux_qualificacoes_categorias_normalized_code_active','ux_qualificacoes_categorias_lms_integrada_active','idx_qualificacoes_categorias_lms_integrada')" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 4) process.exit(1)' || fail=1
assert_json "0457 triggers exist" "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE '%_0457'" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 14) process.exit(1)' || fail=1
assert_json "no duplicate active normalized category names" "SELECT COUNT(*) AS n FROM (SELECT empresa_id, UPPER(TRIM(nome)) AS k FROM qualificacoes_categorias WHERE ativo=1 AND deleted_at IS NULL GROUP BY empresa_id, UPPER(TRIM(nome)) HAVING COUNT(*) > 1)" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1
assert_json "no duplicate active normalized category codes" "SELECT COUNT(*) AS n FROM (SELECT empresa_id, UPPER(TRIM(codigo)) AS k FROM qualificacoes_categorias WHERE ativo=1 AND deleted_at IS NULL GROUP BY empresa_id, UPPER(TRIM(codigo)) HAVING COUNT(*) > 1)" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1
assert_json "at most one active LMS-integrated category per tenant" "SELECT COUNT(*) AS n FROM (SELECT empresa_id FROM qualificacoes_categorias WHERE lms_integrada=1 AND ativo=1 AND deleted_at IS NULL GROUP BY empresa_id HAVING COUNT(*) > 1)" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1
assert_json "LMS-integrated categories are active" "SELECT COUNT(*) AS n FROM qualificacoes_categorias WHERE lms_integrada=1 AND (ativo<>1 OR deleted_at IS NOT NULL)" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi
echo "POSTCONDITIONS_OK"
