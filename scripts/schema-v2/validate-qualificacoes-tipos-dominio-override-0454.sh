#!/usr/bin/env bash
# Read-only production post-validation for Schema V2 change 0454
# (qualificacoes_tipos.dominio_codigo — per-tipo operational-domain
# override). Mirrors validate-ead-category-reconciliation-executor-0453.sh.
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
assert_json "additive column exists with correct type" "PRAGMA table_info(qualificacoes_tipos)" 'const r=JSON.parse(process.env.RESULT); const c=r.find(x=>x.name==="dominio_codigo"); if(!c||c.type!=="TEXT"||c.notnull!==0)process.exit(1)' || fail=1
assert_json "declared index exists" "SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_qualificacoes_tipos_dominio_codigo'" 'const r=JSON.parse(process.env.RESULT); const s=(r[0]?.sql||"").replace(/\s+/g," "); if(r.length!==1||!/CREATE INDEX idx_qualificacoes_tipos_dominio_codigo ON qualificacoes_tipos\(dominio_codigo\)/i.test(s))process.exit(1)' || fail=1
# Safe-on-apply: this Schema V2 change performs no DML — every row must
# still read dominio_codigo = NULL immediately after applying it. Any
# specific tipo classification is a SEPARATE, explicitly authorized action
# via POST /api/admin/operational-domain-rbac/classify
# (resource_type='qualificacao_tipo'), never this change or this validator.
assert_json "no tipo classified yet (additive-only, no DML in this change)" "SELECT COUNT(*) AS n FROM qualificacoes_tipos WHERE dominio_codigo IS NOT NULL" 'if(JSON.parse(process.env.RESULT)[0]?.n!==0)process.exit(1)' || fail=1
# Only asserts objects confirmed present in production as of this change
# (read-only query, 2026-07-31): dominios_operacionais (0452) exists;
# ead_category_reconciliation_runs (0453) had NOT yet been applied to
# production at that time — never assume a sibling change already landed.
assert_json "0452 catalog table remains present and untouched" "SELECT name FROM sqlite_master WHERE type='table' AND name='dominios_operacionais'" 'const r=JSON.parse(process.env.RESULT).map(x=>x.name); if(JSON.stringify(r)!==JSON.stringify(["dominios_operacionais"]))process.exit(1)' || fail=1
[[ "$fail" -eq 0 ]] || { echo "POSTCONDITIONS_FAILED" >&2; exit 1; }
echo "POSTCONDITIONS_OK"
