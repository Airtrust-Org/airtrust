#!/usr/bin/env bash
set -euo pipefail

ALLOWED_DB_NAME="airtrust-db"
ALLOWED_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
BLOCKED_STAGING_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"

db_name="${PRODUCTION_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${PRODUCTION_D1_ID:-$ALLOWED_DB_ID}"
if [[ "$db_name" != "$ALLOWED_DB_NAME" || "$db_id" != "$ALLOWED_DB_ID" || "$db_id" == "$BLOCKED_STAGING_DB_ID" ]]; then
  echo "ERROR: alvo não corresponde ao D1 de produção permitido." >&2
  exit 1
fi

run_query() {
  (cd worker-airtrust && npx wrangler d1 execute "$db_name" --env production --remote --json --command "$1") \
    | node -e 'let d="";process.stdin.on("data", c => d += c).on("end", () => { const x=JSON.parse(d); console.log(JSON.stringify(x[0]?.results ?? [])); })'
}

assert_json() {
  local description="$1" sql="$2" predicate="$3" result
  result="$(run_query "$sql")"
  echo "$description: $result"
  RESULT="$result" node -e "$predicate" || { echo "FAIL: $description" >&2; return 1; }
}

fail=0
assert_json "validacao_hash column exists, nullable, TEXT" \
  "SELECT name, type, \"notnull\" AS notnull_value FROM pragma_table_info('qualificacoes_historico') WHERE name = 'validacao_hash'" \
  'const r=JSON.parse(process.env.RESULT);if(r.length!==1||String(r[0].type).toUpperCase()!=="TEXT"||r[0].notnull_value!==0)process.exit(1)' || fail=1
assert_json "CHECK constraint on validacao_hash matches 0470" \
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='qualificacoes_historico'" \
  'const r=JSON.parse(process.env.RESULT);const s=String(r[0]?.sql||"").replace(/\s+/g," ");const e="CHECK (validacao_hash IS NULL OR (length(validacao_hash) = 16 AND validacao_hash = upper(validacao_hash)))";if(!s.includes(e))process.exit(1)' || fail=1
assert_json "validation hash index exists" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='idx_qualificacoes_historico_validacao_hash' AND tbl_name='qualificacoes_historico'" \
  'if(JSON.parse(process.env.RESULT)[0]?.n!==1)process.exit(1)' || fail=1
assert_json "validation hash index column" \
  "SELECT GROUP_CONCAT(name, ',') AS cols FROM (SELECT name FROM pragma_index_info('idx_qualificacoes_historico_validacao_hash') ORDER BY seqno)" \
  'if(JSON.parse(process.env.RESULT)[0]?.cols!=="validacao_hash")process.exit(1)' || fail=1
assert_json "validation hash index is partial" \
  "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_qualificacoes_historico_validacao_hash'" \
  'const s=String(JSON.parse(process.env.RESULT)[0]?.sql||"").toUpperCase();if(!s.includes("WHERE")||!s.includes("VALIDACAO_HASH IS NOT NULL")||!s.includes("DELETED_AT IS NULL"))process.exit(1)' || fail=1

[[ "$fail" -eq 0 ]] || { echo "PRODUCTION_0470_POSTCONDITIONS_FAILED" >&2; exit 1; }
echo "PRODUCTION_0470_POSTCONDITIONS_OK"
