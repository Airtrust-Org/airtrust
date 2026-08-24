#!/usr/bin/env bash
# Read-only production postconditions for Schema V2 changes 0467-0469.
set -euo pipefail

DB_NAME="airtrust-db"
ENV_NAME="production"
BLOCKED_STAGING_DB_NAME="airtrust-db-staging-baseline-20260701"
change_id=""

for arg in "$@"; do
  case "$arg" in
    --change-id=*) change_id="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg" >&2; exit 1 ;;
  esac
done

case "$change_id" in
  sigvoos-shadow-parallel-0467|sigvoos-shadow-leg-crew-0468|lms-completion-diagnostics-0469) ;;
  *) echo "ERROR: change-id não permitido: $change_id" >&2; exit 1 ;;
esac

[[ "$DB_NAME" != "$BLOCKED_STAGING_DB_NAME" ]] || { echo "ERROR: staging target configured in production validator" >&2; exit 1; }

run_query() {
  (cd worker-airtrust && npx wrangler d1 execute "$DB_NAME" --env "$ENV_NAME" --remote --json --command "$1") \
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

case "$change_id" in
  sigvoos-shadow-parallel-0467)
    assert_json \
      "0467 shadow tables exist" \
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sigvoos_shadow_runs','sigvoos_shadow_legs','sigvoos_shadow_leg_history','sigvoos_shadow_comparisons') ORDER BY name" \
      'const rows=JSON.parse(process.env.RESULT).map(r=>r.name); const expected=["sigvoos_shadow_comparisons","sigvoos_shadow_leg_history","sigvoos_shadow_legs","sigvoos_shadow_runs"]; if(JSON.stringify(rows)!==JSON.stringify(expected)) process.exit(1)' || fail=1
    assert_json \
      "0467 tenant key exists on shadow legs" \
      "SELECT name, type, \"notnull\" AS nn FROM pragma_table_info('sigvoos_shadow_legs') WHERE name='empresa_id'" \
      'const r=JSON.parse(process.env.RESULT)[0]; if(r?.name!=="empresa_id" || String(r?.type).toUpperCase()!=="INTEGER" || r?.nn!==1) process.exit(1)' || fail=1
    assert_json \
      "0467 active leg identity index is unique" \
      "SELECT COUNT(*) AS n FROM pragma_index_list('sigvoos_shadow_legs') WHERE name='idx_sigvoos_shadow_legs_empresa_identity_active' AND \"unique\"=1" \
      'if(JSON.parse(process.env.RESULT)[0]?.n!==1)process.exit(1)' || fail=1
    ;;

  sigvoos-shadow-leg-crew-0468)
    assert_json \
      "0468 crew shadow table exists" \
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='sigvoos_shadow_leg_crews'" \
      'if(JSON.parse(process.env.RESULT)[0]?.n!==1)process.exit(1)' || fail=1
    assert_json \
      "0468 required tenant/leg/crew columns exist" \
      "SELECT name, type, \"notnull\" AS nn FROM pragma_table_info('sigvoos_shadow_leg_crews') WHERE name IN ('empresa_id','leg_id','run_id','crew_identity_key','crew_resolution_method','active') ORDER BY name" \
      'const rows=JSON.parse(process.env.RESULT); const expected=["active","crew_identity_key","crew_resolution_method","empresa_id","leg_id","run_id"]; if(JSON.stringify(rows.map(r=>r.name))!==JSON.stringify(expected))process.exit(1); for(const r of rows){if(r.nn!==1)process.exit(1)}' || fail=1
    assert_json \
      "0468 active crew identity index is unique" \
      "SELECT COUNT(*) AS n FROM pragma_index_list('sigvoos_shadow_leg_crews') WHERE name='idx_sigvoos_shadow_leg_crews_active' AND \"unique\"=1" \
      'if(JSON.parse(process.env.RESULT)[0]?.n!==1)process.exit(1)' || fail=1
    assert_json \
      "0468 active index column order" \
      "SELECT GROUP_CONCAT(name, ',') AS cols FROM (SELECT name FROM pragma_index_info('idx_sigvoos_shadow_leg_crews_active') ORDER BY seqno)" \
      'if(JSON.parse(process.env.RESULT)[0]?.cols!=="empresa_id,leg_id,crew_identity_key")process.exit(1)' || fail=1
    ;;

  lms-completion-diagnostics-0469)
    assert_json \
      "0469 diagnostics table exists" \
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='lms_completion_diagnostics_snapshots'" \
      'if(JSON.parse(process.env.RESULT)[0]?.n!==1)process.exit(1)' || fail=1
    assert_json \
      "0469 required tenant/enrollment columns exist" \
      "SELECT name, type, \"notnull\" AS nn FROM pragma_table_info('lms_completion_diagnostics_snapshots') WHERE name IN ('empresa_id','matricula_id','curso_id','tentativa','diagnostics_json') ORDER BY name" \
      'const rows=JSON.parse(process.env.RESULT); const expected=["curso_id","diagnostics_json","empresa_id","matricula_id","tentativa"]; if(JSON.stringify(rows.map(r=>r.name))!==JSON.stringify(expected))process.exit(1); for(const r of rows){if(r.nn!==1)process.exit(1)}' || fail=1
    assert_json \
      "0469 diagnostics unique index is unique" \
      "SELECT COUNT(*) AS n FROM pragma_index_list('lms_completion_diagnostics_snapshots') WHERE name='idx_lms_completion_diag_unique' AND \"unique\"=1" \
      'if(JSON.parse(process.env.RESULT)[0]?.n!==1)process.exit(1)' || fail=1
    assert_json \
      "0469 unique index column order" \
      "SELECT GROUP_CONCAT(name, ',') AS cols FROM (SELECT name FROM pragma_index_info('idx_lms_completion_diag_unique') ORDER BY seqno)" \
      'if(JSON.parse(process.env.RESULT)[0]?.cols!=="empresa_id,matricula_id,curso_id,tentativa")process.exit(1)' || fail=1
    ;;
esac

if [[ "$fail" -ne 0 ]]; then
  echo "PRODUCTION_POSTCONDITIONS_FAILED change_id=$change_id" >&2
  exit 1
fi

echo "PRODUCTION_POSTCONDITIONS_OK change_id=$change_id"
