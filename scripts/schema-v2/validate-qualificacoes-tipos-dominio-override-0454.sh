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
assert_json "declared index exists on qualificacoes_tipos" "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name='idx_qualificacoes_tipos_dominio_codigo'" 'const r=JSON.parse(process.env.RESULT); if(r.length!==1||r[0]?.name!=="idx_qualificacoes_tipos_dominio_codigo"||r[0]?.tbl_name!=="qualificacoes_tipos")process.exit(1)' || fail=1
assert_json "classified tipos reference active operational domains" "SELECT COUNT(*) AS n FROM qualificacoes_tipos qt LEFT JOIN dominios_operacionais d ON d.codigo = qt.dominio_codigo AND d.ativo = 1 WHERE qt.dominio_codigo IS NOT NULL AND d.codigo IS NULL" 'if(JSON.parse(process.env.RESULT)[0]?.n!==0)process.exit(1)' || fail=1
assert_json "0452 catalog table remains present and untouched" "SELECT name FROM sqlite_master WHERE type='table' AND name='dominios_operacionais'" 'const r=JSON.parse(process.env.RESULT).map(x=>x.name); if(JSON.stringify(r)!==JSON.stringify(["dominios_operacionais"]))process.exit(1)' || fail=1
[[ "$fail" -eq 0 ]] || { echo "POSTCONDITIONS_FAILED" >&2; exit 1; }
echo "POSTCONDITIONS_OK"
