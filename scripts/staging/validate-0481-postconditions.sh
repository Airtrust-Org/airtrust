#!/usr/bin/env bash
# Read-only staging proof for 0481 training dependency planning.
# source_reference: PR #225 / issue #201
# operational_decision: prove the additive tables, guards, runtime triggers and approved AW139 rule after staging apply.
# dry_run_required: validation is read-only.
# rollback_plan_required: scripts/rollback/0481_training_dependency_planning.sql
set -euo pipefail

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"

db_name=""
for arg in "$@"; do
  case "$arg" in
    --target=*) db_name="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg (use --target=<db_name>)" >&2; exit 1 ;;
  esac
done

if [[ "$db_name" != "$ALLOWED_DB_NAME" ]]; then
  echo "ERROR: --target deve ser exatamente $ALLOWED_DB_NAME." >&2
  exit 1
fi
if [[ "$db_name" == "airtrust-db" || "$db_name" == "$BLOCKED_PRODUCTION_DB_ID" ]]; then
  echo "ERROR: alvo de produção recusado." >&2
  exit 1
fi

run_query() {
  (cd worker-airtrust && npx wrangler d1 execute "$db_name" --remote --json --command "$1") \
    | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const s=d.indexOf("[");const e=d.lastIndexOf("]");const x=JSON.parse(s>=0&&e>s?d.slice(s,e+1):d);console.log(JSON.stringify((Array.isArray(x)?x[0]:x)?.results??[]));})'
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
  "0481 tables exist" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('treinamento_dependencias','treinamento_dependencia_eventos')" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 2) process.exit(1)' || fail=1

assert_json \
  "0481 temporary guard objects were removed" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('_0481_preflight_guard','_0481_postseed_guard','_0481_preflight_validate','_0481_postseed_validate')" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1

assert_json \
  "0481 tenant and runtime triggers exist" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('trg_treinamento_dependencias_tenant_insert','trg_treinamento_dependencias_tenant_update','trg_qualificacao_dependencia_after_insert','trg_qualificacao_dependencia_after_update','trg_treinamento_dependencia_evento_dispatch','trg_treinamento_dependencia_evento_recalculate')" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 6) process.exit(1)' || fail=1

assert_json \
  "AW139 source and destination qualifications still match reviewed IDs" \
  "SELECT COUNT(*) AS n FROM qualificacoes_tipos WHERE empresa_id=6 AND deleted_at IS NULL AND ((id=33 AND codigo='G1') OR (id=106 AND codigo='G1-SEM'))" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 2) process.exit(1)' || fail=1

assert_json \
  "AW139 semestral destination still has a current session model" \
  "SELECT COUNT(*) AS n FROM modelos_sessao WHERE empresa_id=6 AND qualificacao_tipo_id=106 AND deleted_at IS NULL" \
  'if ((JSON.parse(process.env.RESULT)[0]?.n ?? 0) < 1) process.exit(1)' || fail=1

assert_json \
  "approved AW139 33 -> 106 dependency is unique and active" \
  "SELECT COUNT(*) AS n FROM treinamento_dependencias WHERE empresa_id=6 AND qualificacao_origem_id=33 AND qualificacao_destino_id=106 AND intervalo_meses=6 AND vigencia_inicio='2026-08-31' AND ativo=1 AND deleted_at IS NULL" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json \
  "0481 d1 migration ledger entry exists exactly once" \
  "SELECT COUNT(*) AS n FROM d1_migrations WHERE name='0481_training_dependency_planning.sql'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi

echo "POSTCONDITIONS_OK"
