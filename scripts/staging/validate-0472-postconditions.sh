#!/usr/bin/env bash
# Read-only post-condition validation for
# 0472_frms_operational_readiness.sql.
#
# Strictly read-only: only SELECT / PRAGMA / sqlite_master queries are issued.
# No row-mutating or schema-mutating statement is ever emitted by this script.
# It refuses any --target that is not the official staging D1 and never accepts
# the production D1 identifier.
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

# 1. frms_readiness_assessment table exists
assert_json \
  "frms_readiness_assessment table exists" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='frms_readiness_assessment'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

# 2. frms_readiness_vigilance_trial table exists
assert_json \
  "frms_readiness_vigilance_trial table exists" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='frms_readiness_vigilance_trial'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

# 3. assessment essential columns
assert_json \
  "frms_readiness_assessment has the essential columns" \
  "SELECT GROUP_CONCAT(name, ',') AS cols FROM pragma_table_info('frms_readiness_assessment')" \
  'const cols=String(JSON.parse(process.env.RESULT)[0]?.cols || "").split(","); const need=["id","empresa_id","funcionario_id","checkin_id","reference_date","protocol_version","scoring_version","classification","baseline_sessions","baseline_ready","duration_ms","valid_trials","lapse_rate","created_at","deleted_at"]; const missing=need.filter((c)=>!cols.includes(c)); if(missing.length){console.error("missing assessment cols: "+missing.join(","));process.exit(1);}' || fail=1

# 4. vigilance_trial essential columns
assert_json \
  "frms_readiness_vigilance_trial has the essential columns" \
  "SELECT GROUP_CONCAT(name, ',') AS cols FROM pragma_table_info('frms_readiness_vigilance_trial')" \
  'const cols=String(JSON.parse(process.env.RESULT)[0]?.cols || "").split(","); const need=["id","assessment_id","empresa_id","funcionario_id","sequence","scheduled_at_ms","stimulus_at_ms","response_at_ms","reaction_time_ms","outcome","created_at"]; const missing=need.filter((c)=>!cols.includes(c)); if(missing.length){console.error("missing trial cols: "+missing.join(","));process.exit(1);}' || fail=1

# 5. indexes exist
assert_json \
  "0472 indexes exist" \
  "SELECT GROUP_CONCAT(name, ',') AS idx FROM sqlite_master WHERE type='index' AND name IN ('idx_frms_readiness_checkin','idx_frms_readiness_person_day','idx_frms_readiness_baseline','idx_frms_readiness_classification','idx_frms_readiness_trial_sequence','idx_frms_readiness_trial_person')" \
  'const idx=String(JSON.parse(process.env.RESULT)[0]?.idx || "").split(","); const need=["idx_frms_readiness_checkin","idx_frms_readiness_person_day","idx_frms_readiness_baseline","idx_frms_readiness_classification","idx_frms_readiness_trial_sequence","idx_frms_readiness_trial_person"]; const missing=need.filter((c)=>!idx.includes(c)); if(missing.length){console.error("missing indexes: "+missing.join(","));process.exit(1);}' || fail=1

# 6. classification CHECK still restricted to the four authoritative values
assert_json \
  "classification CHECK restricted to baseline_building/preserved/attention/operational_review" \
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='frms_readiness_assessment'" \
  'const sql=String(JSON.parse(process.env.RESULT)[0]?.sql || "").replace(/\s+/g," "); const expected="classification IN (\x27baseline_building\x27, \x27preserved\x27, \x27attention\x27, \x27operational_review\x27)"; if(!sql.includes(expected)){console.error("classification CHECK not found verbatim");process.exit(1);}' || fail=1

# 7. outcome CHECK still restricted to response/lapse/false_start/missed
assert_json \
  "outcome CHECK restricted to response/lapse/false_start/missed" \
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='frms_readiness_vigilance_trial'" \
  'const sql=String(JSON.parse(process.env.RESULT)[0]?.sql || "").replace(/\s+/g," "); const expected="outcome IN (\x27response\x27, \x27lapse\x27, \x27false_start\x27, \x27missed\x27)"; if(!sql.includes(expected)){console.error("outcome CHECK not found verbatim");process.exit(1);}' || fail=1

# 8. structural tenant isolation: empresa_id present on both tables and in the
#    tenant-scoped indexes (no regression to a tenant-blind schema).
assert_json \
  "empresa_id present on both readiness tables" \
  "SELECT (SELECT COUNT(*) FROM pragma_table_info('frms_readiness_assessment') WHERE name='empresa_id') AS a, (SELECT COUNT(*) FROM pragma_table_info('frms_readiness_vigilance_trial') WHERE name='empresa_id') AS t" \
  'const r=JSON.parse(process.env.RESULT)[0]||{}; if(Number(r.a)!==1 || Number(r.t)!==1) process.exit(1);' || fail=1

assert_json \
  "tenant-scoped readiness indexes lead with empresa_id" \
  "SELECT name, sql FROM sqlite_master WHERE type='index' AND name IN ('idx_frms_readiness_checkin','idx_frms_readiness_person_day','idx_frms_readiness_baseline','idx_frms_readiness_classification','idx_frms_readiness_trial_sequence','idx_frms_readiness_trial_person')" \
  'const rows=JSON.parse(process.env.RESULT); if(rows.length!==6) process.exit(1); for(const row of rows){ const s=String(row.sql||"").replace(/\s+/g," "); const m=s.match(/\(([^)]*)\)/); if(!m){console.error("no column list for "+row.name);process.exit(1);} const first=m[1].split(",")[0].trim().replace(/["`\x5b\x5d]/g,""); if(first!=="empresa_id"){console.error(row.name+" does not lead with empresa_id: "+first);process.exit(1);} }' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi

echo "POSTCONDITIONS_OK"
