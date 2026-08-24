#!/usr/bin/env bash
# Read-only post-condition validation for
# 0469_lms_completion_pendencias_snapshots.sql.
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
  "diagnostics snapshot table exists" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='lms_completion_diagnostics_snapshots'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json \
  "required tenant-scoped columns exist with expected types" \
  "SELECT name, type, \"notnull\" AS notnull_value FROM pragma_table_info('lms_completion_diagnostics_snapshots') WHERE name IN ('empresa_id','matricula_id','curso_id','tentativa','diagnostics_json','created_at','updated_at') ORDER BY name" \
  'const rows=JSON.parse(process.env.RESULT); const expected={empresa_id:"INTEGER",matricula_id:"INTEGER",curso_id:"INTEGER",tentativa:"INTEGER",diagnostics_json:"TEXT",created_at:"TEXT",updated_at:"TEXT"}; if(rows.length!==7) process.exit(1); for(const r of rows){ if(expected[r.name]!==String(r.type).toUpperCase() || r.notnull_value!==1) process.exit(1); }' || fail=1

assert_json \
  "unique tenant/matricula/curso/tentativa index exists" \
  "SELECT COUNT(*) AS n FROM pragma_index_list('lms_completion_diagnostics_snapshots') WHERE name='idx_lms_completion_diag_unique' AND \"unique\"=1" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json \
  "unique index covers empresa/matricula/curso/tentativa in order" \
  "SELECT GROUP_CONCAT(name, ',') AS cols FROM pragma_index_info('idx_lms_completion_diag_unique') ORDER BY seqno" \
  'if (JSON.parse(process.env.RESULT)[0]?.cols !== "empresa_id,matricula_id,curso_id,tentativa") process.exit(1)' || fail=1

assert_json \
  "tenant/matricula lookup index exists" \
  "SELECT COUNT(*) AS n FROM pragma_index_list('lms_completion_diagnostics_snapshots') WHERE name='idx_lms_completion_diag_matricula'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi

echo "POSTCONDITIONS_OK"
