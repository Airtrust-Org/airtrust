#!/usr/bin/env bash
# Governed staging-only runner for the reviewed 0438 RDV Schema V2 bundle.
# Default mode is read-only preflight. --apply requires explicit confirmation.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
BLOCKED_PRODUCTION_DB_NAME="airtrust-db"
CONFIRMATION_PHRASE="AIRTRUST_STAGING_SCHEMA_V2_0438"
MIGRATION_NAME="0438_controle_voos_rdv_coordenacao_workflow.sql"
CHANGE_ID="0438-rdv-coordination-workflow-production"
BASELINE_ID="production-d1-baseline-v2-20260714"

apply=false
migration_arg=""
for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --migration=*) migration_arg="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg" >&2; exit 1 ;;
  esac
done

expected_path="release/worker-airtrust/migrations/$MIGRATION_NAME"
if [[ "$migration_arg" != "$expected_path" ]]; then
  echo "ERROR: 0438 exige caminho exato $expected_path." >&2
  exit 1
fi
if [[ -L "$migration_arg" || ! -f "$migration_arg" ]]; then
  echo "ERROR: migration 0438 ausente ou symlink recusado." >&2
  exit 1
fi
if ! git -C release diff --quiet -- "worker-airtrust/migrations/$MIGRATION_NAME" || \
   ! git -C release diff --cached --quiet -- "worker-airtrust/migrations/$MIGRATION_NAME"; then
  echo "ERROR: migration 0438 possui alteração local não commitada." >&2
  exit 1
fi

release_sha="$(git -C release rev-parse HEAD)"
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERROR: release SHA inválido." >&2
  exit 1
fi

db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
if [[ "$db_name" != "$ALLOWED_DB_NAME" || "$db_id" != "$ALLOWED_DB_ID" ]]; then
  echo "ERROR: alvo não corresponde ao D1 oficial de staging." >&2
  exit 1
fi
if [[ "$db_id" == "$BLOCKED_PRODUCTION_DB_ID" || "$db_name" == "$BLOCKED_PRODUCTION_DB_NAME" ]]; then
  echo "ERROR: alvo de produção recusado." >&2
  exit 1
fi

query_value() {
  local sql="$1"
  node - "$db_name" "$sql" <<'NODE'
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const [,, dbName, sql] = process.argv;
const res = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', dbName, '--remote', '--json', '--command', sql],
  { cwd: path.join(process.cwd(), 'worker-airtrust'), encoding: 'utf8', env: process.env },
);
if (res.status !== 0) {
  process.stderr.write(`wrangler failed with code ${res.status}\nstdout: ${res.stdout}\nstderr: ${res.stderr}\n`);
  process.exit(1);
}
let parsed;
try {
  parsed = JSON.parse(res.stdout);
} catch {
  const start = res.stdout.indexOf('[');
  const end = res.stdout.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error(`D1_JSON_NOT_FOUND:${res.stdout}`);
  parsed = JSON.parse(res.stdout.slice(start, end + 1));
}
const results = Array.isArray(parsed) ? parsed[0]?.results : parsed?.results;
const row = results?.[0];
if (!row || typeof row !== 'object') throw new Error(`D1_RESULT_MISSING:${JSON.stringify(parsed)}`);
const value = row.value ?? row.count ?? row.COUNT ?? row.total ?? row.TOTAL ?? row['COUNT(*)'] ?? row['count(*)'] ?? Object.values(row)[0];
process.stdout.write(value == null ? '' : String(value));
NODE
}

query_count() {
  local value
  value="$(query_value "$1")"
  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "ERROR: resultado de contagem inválido: $value" >&2
    exit 1
  fi
  printf '%s' "$value"
}

marker_count="$(query_count "SELECT (SELECT COUNT(*) FROM pragma_table_info('cv_rdv_operacional') WHERE name IN ('workflow_status','versao')) + (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('cv_rdv_aprovacoes','cv_rdv_revisoes','cv_rdv_alertas','cv_voo_abastecimentos')) + (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_cv_voo_etapas_empresa_voo_numero_unique') AS count;")"
d1_count="$(query_count "SELECT COUNT(*) AS count FROM d1_migrations WHERE name = '$MIGRATION_NAME';")"
schema_table_count="$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='airtrust_schema_changes_v2';")"
if [[ "$schema_table_count" == "1" ]]; then
  schema_count="$(query_count "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id = '$CHANGE_ID';")"
  baseline_count="$(query_count "SELECT COUNT(*) AS count FROM airtrust_schema_baselines_v2 WHERE baseline_id = '$BASELINE_ID' AND status = 'ACTIVE';")"
else
  schema_count="0"
  baseline_count="0"
fi

duplicate_groups="$(query_count "SELECT COUNT(*) AS count FROM (SELECT empresa_id, voo_id, numero_etapa FROM cv_voo_etapas WHERE deleted_at IS NULL GROUP BY empresa_id, voo_id, numero_etapa HAVING COUNT(*) > 1);")"

printf 'TARGET_DB=%s\nRELEASE_SHA=%s\nMIGRATION=%s\nCHANGE_ID=%s\nMARKERS_PRESENT=%s/7\nD1_LEDGER_COUNT=%s\nSCHEMA_V2_LEDGER_COUNT=%s\nACTIVE_BASELINE_COUNT=%s\nACTIVE_STAGE_DUPLICATE_GROUPS=%s\n' \
  "$db_name" "$release_sha" "$MIGRATION_NAME" "$CHANGE_ID" "$marker_count" "$d1_count" "$schema_count" "$baseline_count" "$duplicate_groups"

# Aggregate operational volumes only. No row content is printed.
rdv_tables="$(query_value "SELECT group_concat(name, ' ') AS value FROM sqlite_master WHERE type='table' AND name LIKE 'cv_rdv_%' ORDER BY name;")"
for table in $rdv_tables; do
  if [[ ! "$table" =~ ^cv_rdv_[a-z0-9_]+$ ]]; then
    echo "ERROR: nome de tabela inesperado no inventário RDV: $table" >&2
    exit 1
  fi
  count="$(query_count "SELECT COUNT(*) AS count FROM $table;")"
  echo "AGGREGATE_COUNT:$table=$count"
done
echo "AGGREGATE_COUNT:cv_voo_etapas=$(query_count "SELECT COUNT(*) AS count FROM cv_voo_etapas;")"
echo "AGGREGATE_COUNT:cv_voo_etapas_active=$(query_count "SELECT COUNT(*) AS count FROM cv_voo_etapas WHERE deleted_at IS NULL;")"

if [[ "$duplicate_groups" != "0" ]]; then
  echo "ERROR: 0438 NO-GO: existem duplicidades ativas de (empresa_id, voo_id, numero_etapa)." >&2
  exit 1
fi

# Any partial marker state is an incident. Never heal it by inserting ledgers.
if [[ "$marker_count" != "0" && "$marker_count" != "7" ]]; then
  echo "ERROR: 0438 PARTIAL_SCHEMA_STATE: $marker_count/7 markers presentes." >&2
  exit 1
fi

# A complete prior apply must be treated as a rejected second apply, as required
# by the reviewed plan. Postconditions may be run separately in read-only mode.
if [[ "$marker_count" == "7" ]]; then
  if [[ "$d1_count" == "1" && "$schema_count" == "1" ]]; then
    echo "ERROR: 0438 ALREADY_APPLIED: segunda aplicação recusada pelo ledger guard." >&2
  else
    echo "ERROR: 0438 COMPLETE_SCHEMA_LEDGER_DIVERGENCE: não reconciliar automaticamente." >&2
  fi
  exit 1
fi

if [[ "$d1_count" != "0" || "$schema_count" != "0" ]]; then
  echo "ERROR: 0438 LEDGER_WITHOUT_SCHEMA: estado inconsistente; investigação obrigatória." >&2
  exit 1
fi
if [[ "$baseline_count" != "1" ]]; then
  echo "ERROR: baseline Schema V2 ativo esperado exatamente uma vez: $BASELINE_ID" >&2
  exit 1
fi

echo "RDV_0438_READ_ONLY_PREFLIGHT=PASS"

combined_sql="$(mktemp -t airtrust-staging-0438-dual-ledger.XXXXXXXX.sql)"
recovery_output="$(mktemp -t airtrust-staging-0438-recovery.XXXXXXXX)"
trap 'rm -f "$combined_sql" "$recovery_output"' EXIT

bundle_result="$(node scripts/staging/build-0438-dual-ledger-apply.mjs release "$release_sha" "$combined_sql")"
node -e '
  const result = JSON.parse(process.argv[1]);
  if (result.migrationName !== "0438_controle_voos_rdv_coordenacao_workflow.sql") throw new Error("RDV_0438_BUNDLE_MIGRATION_MISMATCH");
  if (result.changeId !== "0438-rdv-coordination-workflow-production") throw new Error("RDV_0438_BUNDLE_CHANGE_ID_MISMATCH");
  if (result.releaseSha !== process.argv[2]) throw new Error("RDV_0438_BUNDLE_RELEASE_SHA_MISMATCH");
  if (!result.fileHash || !result.planHash || !result.manifestHash) throw new Error("RDV_0438_BUNDLE_METADATA_INCOMPLETE");
' "$bundle_result" "$release_sha"
test -s "$combined_sql"
echo "RDV_0438_DUAL_LEDGER_BUNDLE=VERIFIED"

if ! $apply; then
  echo "DRY_RUN=true"
  exit 0
fi
if [[ "${CONFIRM_STAGING_SCHEMA_V2_0438:-}" != "$CONFIRMATION_PHRASE" ]]; then
  echo "ERROR: --apply requer CONFIRM_STAGING_SCHEMA_V2_0438=$CONFIRMATION_PHRASE." >&2
  exit 1
fi

recovery_timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
(
  cd worker-airtrust
  npx wrangler d1 time-travel info "$db_name" --timestamp="$recovery_timestamp" --json > "$recovery_output"
)
test -s "$recovery_output"
node - "$recovery_output" <<'NODE'
const fs = require('node:fs');
const parsed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!/bookmark/i.test(JSON.stringify(parsed))) throw new Error('TIME_TRAVEL_BOOKMARK_NOT_CONFIRMED');
NODE
echo "RECOVERY_TIMESTAMP_UTC=$recovery_timestamp"
echo "RECOVERY_POINT_CAPTURED=true"

(
  cd worker-airtrust
  npx wrangler d1 execute "$db_name" --remote --file="$combined_sql"
)

bash scripts/staging/validate-0438-postconditions.sh --target="$db_name"
echo "RDV_0438_SCHEMA_V2_APPLY=PASS"
