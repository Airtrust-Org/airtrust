#!/usr/bin/env bash
# Read-only post-condition validation for 0467_sigvoos_shadow_parallel_v1.sql.
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
  "shadow tables exist" \
  "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sigvoos_shadow_runs','sigvoos_shadow_legs','sigvoos_shadow_leg_history','sigvoos_shadow_comparisons') ORDER BY name" \
  'const rows=JSON.parse(process.env.RESULT).map(r=>r.name); const expected=["sigvoos_shadow_comparisons","sigvoos_shadow_leg_history","sigvoos_shadow_legs","sigvoos_shadow_runs"]; if(JSON.stringify(rows)!==JSON.stringify(expected)) process.exit(1)' || fail=1

assert_json \
  "shadow runs is tenant scoped" \
  "SELECT name, type, \"notnull\" AS nn FROM pragma_table_info('sigvoos_shadow_runs') WHERE name IN ('id','empresa_id','period_from','period_to','status') ORDER BY name" \
  'const rows=JSON.parse(process.env.RESULT); const names=rows.map(r=>r.name); for(const n of ["empresa_id","id","period_from","period_to","status"]){if(!names.includes(n))process.exit(1)}; if(rows.find(r=>r.name==="empresa_id")?.nn!==1)process.exit(1)' || fail=1

assert_json \
  "shadow legs is tenant scoped" \
  "SELECT name, type, \"notnull\" AS nn FROM pragma_table_info('sigvoos_shadow_legs') WHERE name IN ('id','empresa_id','run_id','identity_key','active') ORDER BY name" \
  'const rows=JSON.parse(process.env.RESULT); const names=rows.map(r=>r.name); for(const n of ["active","empresa_id","id","identity_key","run_id"]){if(!names.includes(n))process.exit(1)}; if(rows.find(r=>r.name==="empresa_id")?.nn!==1)process.exit(1)' || fail=1

assert_json \
  "active leg identity index is unique" \
  "SELECT COUNT(*) AS n FROM pragma_index_list('sigvoos_shadow_legs') WHERE name='idx_sigvoos_shadow_legs_empresa_identity_active' AND \"unique\"=1" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json \
  "comparison tenant/run index exists" \
  "SELECT COUNT(*) AS n FROM pragma_index_list('sigvoos_shadow_comparisons') WHERE name='idx_sigvoos_shadow_comparisons_empresa_run'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi

echo "POSTCONDITIONS_OK"
