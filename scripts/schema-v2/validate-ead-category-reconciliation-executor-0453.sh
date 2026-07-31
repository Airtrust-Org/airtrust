#!/usr/bin/env bash
# Read-only production post-validation for Schema V2 change 0453.
set -euo pipefail

db_name=""
for arg in "$@"; do
  case "$arg" in
    --target=*) db_name="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg (use --target=airtrust-db)" >&2; exit 1 ;;
  esac
done
if [[ "$db_name" != "airtrust-db" ]]; then
  echo "ERROR: --target deve ser exatamente airtrust-db." >&2
  exit 1
fi

run_query() {
  (cd worker-airtrust && npx wrangler d1 execute "$db_name" --env production --remote --json --command "$1") \
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
assert_json "functional EAD tables remain present" "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('qualificacoes_categorias','qualificacoes_tipos','historico_qualificacoes','lms_cursos') ORDER BY name" 'const r=JSON.parse(process.env.RESULT).map(x=>x.name); if(JSON.stringify(r)!==JSON.stringify(["historico_qualificacoes","lms_cursos","qualificacoes_categorias","qualificacoes_tipos"]))process.exit(1)' || fail=1
[[ "$fail" -eq 0 ]] || { echo "POSTCONDITIONS_FAILED" >&2; exit 1; }
echo "POSTCONDITIONS_OK"
