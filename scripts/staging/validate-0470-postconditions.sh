#!/usr/bin/env bash
# Read-only post-condition validation for
# 0470_certificado_validacao_hash_index.sql.
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
  "validacao_hash column exists, nullable, TEXT" \
  "SELECT name, type, \"notnull\" AS notnull_value FROM pragma_table_info('qualificacoes_historico') WHERE name = 'validacao_hash'" \
  'const rows=JSON.parse(process.env.RESULT); if(rows.length!==1) process.exit(1); const r=rows[0]; if(String(r.type).toUpperCase()!=="TEXT" || r.notnull_value!==0) process.exit(1);' || fail=1

assert_json \
  "CHECK constraint on validacao_hash matches the 0470 migration exactly" \
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='qualificacoes_historico'" \
  'const rows=JSON.parse(process.env.RESULT); const sql=String(rows[0]?.sql || ""); const expected="CHECK (validacao_hash IS NULL OR (length(validacao_hash) = 16 AND validacao_hash = upper(validacao_hash)))"; const normalize=(s)=>s.replace(/\s+/g," ").trim(); if(!normalize(sql).includes(normalize(expected))) process.exit(1);' || fail=1

assert_json \
  "idx_qualificacoes_historico_validacao_hash index exists" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND name='idx_qualificacoes_historico_validacao_hash' AND tbl_name='qualificacoes_historico'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json \
  "index references validacao_hash column" \
  "SELECT GROUP_CONCAT(name, ',') AS cols FROM (SELECT name FROM pragma_index_info('idx_qualificacoes_historico_validacao_hash') ORDER BY seqno)" \
  'if (JSON.parse(process.env.RESULT)[0]?.cols !== "validacao_hash") process.exit(1)' || fail=1

assert_json \
  "index is partial (validacao_hash IS NOT NULL AND deleted_at IS NULL)" \
  "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_qualificacoes_historico_validacao_hash'" \
  'const rows=JSON.parse(process.env.RESULT); const sql=String(rows[0]?.sql || "").toUpperCase(); if(!sql.includes("WHERE") || !sql.includes("VALIDACAO_HASH IS NOT NULL") || !sql.includes("DELETED_AT IS NULL")) process.exit(1);' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi

echo "POSTCONDITIONS_OK"
