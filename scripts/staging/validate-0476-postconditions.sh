#!/usr/bin/env bash
# Read-only staging proof for the 0476 FRMS PVT-B V2 + Operational Load V1 governance.
# Additive-only: baseline protocol index + 8 operational load columns.
# Zero destructive change, zero writes.
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
  echo "ERROR: --target deve ser exatamente o D1 oficial de staging ($ALLOWED_DB_NAME)." >&2
  exit 1
fi
if [[ "$db_name" == "airtrust-db" || "$db_name" == "$BLOCKED_DB_ID" ]]; then
  echo "ERROR: alvo de produção recusado." >&2
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

# 1. idx_frms_readiness_baseline_protocol index exists on frms_readiness_assessment
assert_json \
  "idx_frms_readiness_baseline_protocol index exists" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='idx_frms_readiness_baseline_protocol' AND tbl_name='frms_readiness_assessment'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

# 2. idx_frms_readiness_baseline_protocol index covers protocol_version and deleted_at filter
assert_json \
  "idx_frms_readiness_baseline_protocol index structure" \
  "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_frms_readiness_baseline_protocol'" \
  'const sql=String(JSON.parse(process.env.RESULT)[0]?.sql || "").replace(/\s+/g," "); if(!sql.includes("protocol_version") || !sql.includes("deleted_at IS NULL")){console.error("index sql missing protocol_version or deleted_at: "+sql);process.exit(1);}' || fail=1

# 3. frms_fatorizacao_jornada has all 8 operational load columns
assert_json \
  "frms_fatorizacao_jornada has all 8 operational_load columns" \
  "SELECT GROUP_CONCAT(name, ',') AS cols FROM pragma_table_info('frms_fatorizacao_jornada')" \
  'const cols=String(JSON.parse(process.env.RESULT)[0]?.cols || "").split(","); const need=["operational_load_policy_version","operational_load_landings_count","operational_load_temperature_max_c","operational_load_weather_quality","operational_load_data_quality","operational_load_landings_delta","operational_load_temperature_delta","operational_load_total_delta"]; const missing=need.filter((c)=>!cols.includes(c)); if(missing.length){console.error("missing operational_load cols: "+missing.join(","));process.exit(1);}' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi

echo "POSTCONDITIONS_OK"
