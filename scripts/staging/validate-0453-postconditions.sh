#!/usr/bin/env bash
# Read-only staging validation for the additive EAD reconciliation ledger.
# This intentionally has no default target and never mutates D1.
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

if [[ -z "$db_name" || "$db_name" != "$ALLOWED_DB_NAME" || "$ALLOWED_DB_ID" == "$BLOCKED_DB_ID" ]]; then
  echo "ERROR: --target deve ser exatamente o D1 oficial de staging." >&2
  exit 1
fi

run_query() {
  (cd worker-airtrust && npx wrangler d1 execute "$db_name" --remote --json --command "$1") \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.stringify(JSON.parse(d)[0]?.results ?? [])))'
}

assert_json() {
  local description="$1" sql="$2" predicate="$3" result
  result="$(run_query "$sql")"
  echo "$description: $result"
  RESULT="$result" node -e "$predicate" || { echo "FAIL: $description" >&2; return 1; }
}

fail=0
assert_json "ledger table exists" "SELECT sql FROM sqlite_master WHERE type='table' AND name='ead_category_reconciliation_runs'" 'const r=JSON.parse(process.env.RESULT); const s=(r[0]?.sql||"").replace(/\s+/g," "); if(r.length!==1||!s.includes("CHECK (empresa_id = 6)")||!s.includes("status IN (\x27APPLIED\x27, \x27ROLLED_BACK\x27)"))process.exit(1)' || fail=1
assert_json "ledger columns and types" "PRAGMA table_info(ead_category_reconciliation_runs)" 'const r=JSON.parse(process.env.RESULT); const e={run_uuid:"TEXT",empresa_id:"INTEGER",plan_sha256:"TEXT",source_sha:"TEXT",worker_version:"TEXT",snapshot_key:"TEXT",snapshot_sha256:"TEXT",rollback_key:"TEXT",status:"TEXT",totals_json:"TEXT",created_at:"TEXT",rolled_back_at:"TEXT"}; if(r.length!==Object.keys(e).length||Object.entries(e).some(([n,t])=>r.find(x=>x.name===n)?.type!==t))process.exit(1)' || fail=1
assert_json "partial unique active-run index" "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_ead_category_reconciliation_single_active'" 'const r=JSON.parse(process.env.RESULT); const s=(r[0]?.sql||"").replace(/\s+/g," "); if(r.length!==1||!/^CREATE UNIQUE INDEX idx_ead_category_reconciliation_single_active ON ead_category_reconciliation_runs\(empresa_id\) WHERE status = \x27APPLIED\x27$/i.test(s))process.exit(1)' || fail=1
assert_json "ledger is empty before reconciliation" "SELECT COUNT(*) AS n FROM ead_category_reconciliation_runs" 'if(JSON.parse(process.env.RESULT)[0]?.n!==0)process.exit(1)' || fail=1
assert_json "functional EAD tables remain present" "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('qualificacoes_categorias','qualificacoes_tipos','qualificacoes_historico','lms_cursos') ORDER BY name" 'const r=JSON.parse(process.env.RESULT).map(x=>x.name); if(JSON.stringify(r)!==JSON.stringify(["lms_cursos","qualificacoes_categorias","qualificacoes_historico","qualificacoes_tipos"]))process.exit(1)' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi
echo "POSTCONDITIONS_OK"
