#!/usr/bin/env bash
# Read-only post-condition validation for
# 0459_sk76_periodic_code_denominator.sql.
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

old_codes="'S76-P-01/04-C1','S76-P-01/04-C2','S76-P-01/04-C3','S76-P-02/04-C1','S76-P-02/04-C2','S76-P-02/04-C3'"
new_codes="'S76-P-01/03-C1','S76-P-01/03-C2','S76-P-01/03-C3','S76-P-02/03-C1','S76-P-02/03-C2','S76-P-02/03-C3'"

fail=0
assert_json "no legacy /04 canonical codes remain" "SELECT COUNT(*) AS n FROM modelos_sessao_versionamento WHERE empresa_id=6 AND codigo_canonico IN ($old_codes)" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1
assert_json "exactly six current /03 canonical codes exist" "SELECT COUNT(*) AS n FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 AND codigo_canonico IN ($new_codes)" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 6) process.exit(1)' || fail=1
assert_json "physical model codes match /03 identity" "SELECT COUNT(*) AS n FROM modelos_sessao_versionamento v JOIN modelos_sessao ms ON ms.id=v.modelo_id AND ms.empresa_id=v.empresa_id WHERE v.empresa_id=6 AND v.is_current=1 AND v.codigo_canonico IN ($new_codes) AND ms.codigo=v.codigo_canonico" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 6) process.exit(1)' || fail=1
assert_json "each corrected model preserves 18 active manoeuvre links" "SELECT COUNT(*) AS n FROM (SELECT v.modelo_id FROM modelos_sessao_versionamento v WHERE v.empresa_id=6 AND v.is_current=1 AND v.codigo_canonico IN ($new_codes) AND (SELECT COUNT(*) FROM modelos_sessao_manobras msm WHERE msm.modelo_id=v.modelo_id AND msm.deleted_at IS NULL) <> 18)" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1
assert_json "no active /04 guide codes remain" "SELECT COUNT(*) AS n FROM simuladores_guias_instrutor WHERE empresa_id=6 AND deleted_at IS NULL AND codigo IN ($old_codes)" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1
assert_json "exactly six active /03 guide codes exist" "SELECT COUNT(*) AS n FROM simuladores_guias_instrutor WHERE empresa_id=6 AND deleted_at IS NULL AND codigo IN ($new_codes)" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 6) process.exit(1)' || fail=1
assert_json "version immutability trigger restored" "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name='trg_modelo_versao_integridade_update'" 'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi
echo "POSTCONDITIONS_OK"
