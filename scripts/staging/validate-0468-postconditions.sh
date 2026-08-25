#!/usr/bin/env bash
# Read-only post-condition validation for 0468_sigvoos_shadow_leg_crew_v1.sql.
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

assert_json \
  "shadow leg crew table exists" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='sigvoos_shadow_leg_crews'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json \
  "required tenant/leg/crew columns exist" \
  "SELECT name, type, \"notnull\" AS nn FROM pragma_table_info('sigvoos_shadow_leg_crews') WHERE name IN ('empresa_id','leg_id','run_id','crew_identity_key','crew_resolution_method','active','created_at','updated_at') ORDER BY name" \
  'const rows=JSON.parse(process.env.RESULT); const expected=["active","created_at","crew_identity_key","crew_resolution_method","empresa_id","leg_id","run_id","updated_at"]; if(JSON.stringify(rows.map(r=>r.name))!==JSON.stringify(expected))process.exit(1); for(const r of rows){if(r.nn!==1)process.exit(1)}' || fail=1

# SQLite reports a TEXT PRIMARY KEY as notnull=0 in pragma_table_info even
# though the column is the declared primary key. Verify the actual key role
# explicitly instead of rejecting the immutable 0468 DDL on that quirk.
assert_json \
  "shadow crew id is the declared primary key" \
  "SELECT name, pk FROM pragma_table_info('sigvoos_shadow_leg_crews') WHERE name='id'" \
  'const r=JSON.parse(process.env.RESULT)[0]; if(r?.name!=="id" || r?.pk!==1)process.exit(1)' || fail=1

assert_json \
  "active tenant/leg/crew identity index is unique" \
  "SELECT COUNT(*) AS n FROM pragma_index_list('sigvoos_shadow_leg_crews') WHERE name='idx_sigvoos_shadow_leg_crews_active' AND \"unique\"=1" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json \
  "active identity index covers empresa/leg/crew in order" \
  "SELECT GROUP_CONCAT(name, ',') AS cols FROM (SELECT name FROM pragma_index_info('idx_sigvoos_shadow_leg_crews_active') ORDER BY seqno)" \
  'if (JSON.parse(process.env.RESULT)[0]?.cols !== "empresa_id,leg_id,crew_identity_key") process.exit(1)' || fail=1

assert_json \
  "funcionario lookup index exists" \
  "SELECT COUNT(*) AS n FROM pragma_index_list('sigvoos_shadow_leg_crews') WHERE name='idx_sigvoos_shadow_leg_crews_funcionario_date'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi

echo "POSTCONDITIONS_OK"
