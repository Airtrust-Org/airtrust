#!/usr/bin/env bash
# source_reference: post-condition validation for migration 0424, factored out
# of apply-approved-migrations.sh so it can also be run standalone (read-only)
# against staging after a manual apply, without re-running the migration.
# operational_decision: read-only — every check is a SELECT/PRAGMA. Never
# writes. NOTECHS (15 per model) are injected at ficha-build time by
# buildOperationalFichaManobras() (worker-airtrust/src/constants/notechs.ts),
# not stored as manobras rows — this script checks that exactly 18 (técnicos
# only, never 33) manobras rows exist per model, matching that design.
set -euo pipefail

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"

# No default target: a script that silently falls back to a real (even
# non-production) database on a bare invocation is exactly the kind of
# accidental-execution bug this project has been burned by before. The
# caller (apply-approved-migrations.sh) always passes --target= explicitly;
# a bare `bash validate-0424-postconditions.sh` with no arguments must fail
# closed, never reach for a default.
db_name=""
for arg in "$@"; do
  case "$arg" in
    --target=*) db_name="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg (use --target=<db_name>)" >&2; exit 1 ;;
  esac
done

if [[ -z "$db_name" ]]; then
  echo "ERROR: --target=<db_name> é obrigatório — nenhum default é usado, mesmo para leitura." >&2
  exit 1
fi

if [[ "$db_name" != "$ALLOWED_DB_NAME" ]]; then
  echo "ERROR: validação de pós-condições só roda contra $ALLOWED_DB_NAME. Recebido: $db_name" >&2
  exit 1
fi

run_query() {
  ( cd worker-airtrust && npx wrangler d1 execute "$db_name" --remote --json --command "$1" ) \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['results'])"
}

fail=0

echo "-- exatamente 4 modelos EXA-V0% --"
count_modelos="$(run_query "SELECT COUNT(*) AS n FROM modelos_sessao WHERE codigo LIKE 'EXA-V0%' AND deleted_at IS NULL;")"
echo "$count_modelos"
echo "$count_modelos" | grep -q "'n': 4" || { echo "FAIL: esperado 4 modelos"; fail=1; }

echo "-- 18 técnicos por modelo (nunca 33 — NOTECHS são injetados em runtime, não são linhas) --"
per_model="$(run_query "SELECT SUBSTR(codigo,1,7) AS modelo, COUNT(*) AS n FROM manobras WHERE codigo LIKE 'EXA-V0%-%' AND deleted_at IS NULL GROUP BY modelo ORDER BY modelo;")"
echo "$per_model"
echo "$per_model" | grep -qE "'n': 18.*'n': 18.*'n': 18.*'n': 18" || { echo "FAIL: esperado 18 por modelo (4 modelos)"; fail=1; }

echo "-- requisitos sequenciais V02->V01, V03->V02, V04->V03 --"
reqs="$(run_query "SELECT m1.codigo AS de, m2.codigo AS para FROM modelos_sessao_requisitos r JOIN modelos_sessao m1 ON m1.id=r.modelo_sessao_id JOIN modelos_sessao m2 ON m2.id=r.requisito_modelo_sessao_id WHERE m1.codigo LIKE 'EXA-V0%' ORDER BY m1.codigo;")"
echo "$reqs"

echo "-- CRED-EXA intacto (não alterado por esta migration) --"
run_query "SELECT codigo, nome FROM modelos_sessao WHERE codigo='CRED-EXA' AND deleted_at IS NULL;"

echo "-- nenhuma FAP / QRH / FAP13-CRED-* introduzida --"
fap_hits="$(run_query "SELECT COUNT(*) AS n FROM manobras WHERE codigo LIKE 'EXA-V0%-%' AND (nome LIKE '%QRH%' OR nome LIKE '%FAP%' OR codigo LIKE 'FAP13-CRED-%');")"
echo "$fap_hits"
echo "$fap_hits" | grep -q "'n': 0" || { echo "FAIL: FAP/QRH encontrado"; fail=1; }

echo "-- nenhuma tabela auxiliar remanescente --"
aux="$(run_query "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '_migration_0424%';")"
echo "$aux"
echo "$aux" | grep -q "\[\]" || { echo "FAIL: tabela auxiliar remanescente"; fail=1; }

echo "-- foreign_key_check --"
fk="$(run_query "PRAGMA foreign_key_check;" || true)"
echo "$fk"
echo "$fk" | grep -q "\[\]" || { echo "FAIL: foreign_key_check retornou violações"; fail=1; }

echo "NOTE: PRAGMA integrity_check não é suportado pelo D1 remoto (SQLITE_AUTH) — " \
     "usar cópia local restaurada do backup como proxy, conforme docs/ops/staging-release-runbook.md."

if [[ $fail -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED"
  exit 1
fi
echo "POSTCONDITIONS_OK"
