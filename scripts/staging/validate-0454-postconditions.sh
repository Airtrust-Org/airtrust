#!/usr/bin/env bash
# Read-only post-condition validation for
# 0454_qualificacoes_tipos_dominio_override.sql. Deliberately staging-only
# and has no default target, so a bare invocation cannot accidentally reach
# any remote database.
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
assert_json "additive column exists" "SELECT COUNT(*) AS n FROM pragma_table_info('qualificacoes_tipos') WHERE name='dominio_codigo'" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1
assert_json "declared index exists" "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_qualificacoes_tipos_dominio_codigo'" 'if (JSON.parse(process.env.RESULT).length !== 1) process.exit(1)' || fail=1
# Safe-on-apply: the migration itself performs no DML, so every row must
# still have dominio_codigo = NULL immediately after applying it. A
# subsequent, SEPARATE, explicitly-authorized classification action (via
# POST /api/admin/operational-domain-rbac/classify, resource_type=
# 'qualificacao_tipo') is what populates specific rows — never this
# migration, and never this postcondition script.
assert_json "no tipo classification yet (migration is additive-only, no DML)" "SELECT COUNT(*) AS n FROM qualificacoes_tipos WHERE dominio_codigo IS NOT NULL" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1
# Existing 0452 columns/table must remain untouched by this migration.
assert_json "0452 catalog/columns unaffected" "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='dominios_operacionais'" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi
echo "POSTCONDITIONS_OK"
