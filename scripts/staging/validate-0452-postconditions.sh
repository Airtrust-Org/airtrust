#!/usr/bin/env bash
# Read-only post-condition validation for 0452_operational_domain_rbac.sql.
# It is deliberately staging-only and has no default target, so a bare
# invocation cannot accidentally reach any remote database.
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
assert_json "catalog table exists" "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='dominios_operacionais'" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1
assert_json "five active canonical domains" "SELECT codigo, ativo FROM dominios_operacionais ORDER BY codigo" 'const r=JSON.parse(process.env.RESULT); const e=["CORPORATIVO","FRMS","MANUTENCAO","OPERACOES","SGSO"]; if(r.length!==5 || r.some((x,i)=>x.codigo!==e[i] || x.ativo!==1)) process.exit(1)' || fail=1
assert_json "required additive columns" "SELECT m.name AS tabela, p.name AS coluna FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type='table' AND (m.name='setores' AND p.name='dominio_codigo' OR m.name='qualificacoes_categorias' AND p.name='dominio_codigo' OR m.name='lms_cursos' AND p.name='dominio_codigo' OR m.name='empresas' AND p.name='operational_domain_rbac_enabled') ORDER BY m.name" 'const r=JSON.parse(process.env.RESULT); if(r.length!==4) process.exit(1)' || fail=1
assert_json "all tenant flags remain legacy" "SELECT COUNT(*) AS n FROM empresas WHERE COALESCE(operational_domain_rbac_enabled, 0) <> 0" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1
assert_json "no sector classification backfill" "SELECT COUNT(*) AS n FROM setores WHERE dominio_codigo IS NOT NULL" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1
assert_json "no qualification category classification backfill" "SELECT COUNT(*) AS n FROM qualificacoes_categorias WHERE dominio_codigo IS NOT NULL" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1
assert_json "no LMS course classification backfill" "SELECT COUNT(*) AS n FROM lms_cursos WHERE dominio_codigo IS NOT NULL" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1
assert_json "declared indexes exist" "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_setores_dominio_codigo','idx_qualificacoes_categorias_dominio_codigo','idx_lms_cursos_dominio_codigo') ORDER BY name" 'if (JSON.parse(process.env.RESULT).length !== 3) process.exit(1)' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi
echo "POSTCONDITIONS_OK"
