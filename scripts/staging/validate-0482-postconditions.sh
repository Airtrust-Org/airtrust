#!/usr/bin/env bash
# Read-only staging proof for 0482 complete-curriculum dependency enrichment.
# source_reference: PR #227 / training dependency complete curriculum follow-up
# operational_decision: prove 0482 is layered on a valid 0481 baseline and every eligible open dependency snapshot carries the complete active curriculum.
# dry_run_required: validation is read-only.
# rollback_plan_required: scripts/rollback/0482_training_dependency_complete_curriculum.sql
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
  "0481 prerequisite tables exist" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('treinamento_dependencias','treinamento_dependencia_eventos')" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 2) process.exit(1)' || fail=1

assert_json \
  "0481 prerequisite ledger exists exactly once" \
  "SELECT COUNT(*) AS n FROM d1_migrations WHERE name='0481_training_dependency_planning.sql'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json \
  "0482 enrichment trigger exists exactly once" \
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name='trg_training_dependency_plan_enrich'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

assert_json \
  "0482 d1 migration ledger exists exactly once" \
  "SELECT COUNT(*) AS n FROM d1_migrations WHERE name='0482_training_dependency_complete_curriculum.sql'" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 1) process.exit(1)' || fail=1

# Every still-open dependency proposal that has at least one active current
# session model must carry an exact curriculum snapshot. Zero eligible rows is
# valid; the check is universal rather than requiring synthetic staging data.
assert_json \
  "all eligible open dependency snapshots carry the complete active curriculum" \
  "SELECT COUNT(*) AS n
     FROM treinamentos_planejados tp
    WHERE tp.deleted_at IS NULL
      AND tp.planejamento_origem='SIMULADOR_QUINZENA'
      AND tp.planejamento_status IN ('PROPOSTO','PLANEJADO','AGUARDANDO_DISPONIBILIDADE','CONFIRMADO','REPLANEJAR')
      AND json_valid(COALESCE(tp.planejamento_snapshot_json,''))=1
      AND json_extract(tp.planejamento_snapshot_json,'$.generated_by')='TRAINING_DEPENDENCY'
      AND EXISTS (
        SELECT 1 FROM modelos_sessao ms
         WHERE ms.empresa_id=tp.empresa_id
           AND ms.qualificacao_tipo_id=tp.qualificacao_tipo_id
           AND ms.deleted_at IS NULL
           AND COALESCE(ms.ativo,1)=1
      )
      AND (
        COALESCE(json_extract(tp.planejamento_snapshot_json,'$.materialization_strategy'),'')<>'TRAINING_PLAN_REQUIRED'
        OR COALESCE(CAST(json_extract(tp.planejamento_snapshot_json,'$.curriculum_total_sessions') AS INTEGER),-1)<>
           (SELECT COUNT(*) FROM modelos_sessao ms
             WHERE ms.empresa_id=tp.empresa_id
               AND ms.qualificacao_tipo_id=tp.qualificacao_tipo_id
               AND ms.deleted_at IS NULL
               AND COALESCE(ms.ativo,1)=1)
        OR COALESCE(json_extract(tp.planejamento_snapshot_json,'$.curriculum_model_ids'),'')<>
           COALESCE((SELECT json_group_array(id) FROM (
             SELECT ms.id AS id FROM modelos_sessao ms
              WHERE ms.empresa_id=tp.empresa_id
                AND ms.qualificacao_tipo_id=tp.qualificacao_tipo_id
                AND ms.deleted_at IS NULL
                AND COALESCE(ms.ativo,1)=1
              ORDER BY COALESCE(ms.ordem_no_treinamento,999999),ms.id
           )), '[]')
        OR COALESCE(json_extract(tp.planejamento_snapshot_json,'$.participants[0].session_model_ids'),'')<>
           COALESCE((SELECT json_group_array(id) FROM (
             SELECT ms.id AS id FROM modelos_sessao ms
              WHERE ms.empresa_id=tp.empresa_id
                AND ms.qualificacao_tipo_id=tp.qualificacao_tipo_id
                AND ms.deleted_at IS NULL
                AND COALESCE(ms.ativo,1)=1
              ORDER BY COALESCE(ms.ordem_no_treinamento,999999),ms.id
           )), '[]')
      )" \
  'if (JSON.parse(process.env.RESULT)[0]?.n !== 0) process.exit(1)' || fail=1

if [[ "$fail" -ne 0 ]]; then
  echo "POSTCONDITIONS_FAILED" >&2
  exit 1
fi

echo "POSTCONDITIONS_OK"
