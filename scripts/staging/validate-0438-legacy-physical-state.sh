#!/usr/bin/env bash
# Read-only validation for the historically pre-applied 0438 staging schema.
# This script intentionally DOES NOT reconcile airtrust_schema_changes_v2.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
MIGRATION_NAME="0438_controle_voos_rdv_coordenacao_workflow.sql"
CHANGE_ID="0438-rdv-coordination-workflow-production"
BASELINE_ID="production-d1-baseline-v2-20260714"
target="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"

if [[ "$target" != "$ALLOWED_DB_NAME" ]]; then
  echo "ERROR: legacy 0438 validator accepts only $ALLOWED_DB_NAME, got $target" >&2
  exit 1
fi

query_count() {
  local sql="$1"
  node - "$target" "$sql" <<'NODE'
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const [,, dbName, sql] = process.argv;
const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', dbName, '--config', 'wrangler.toml', '--env', 'staging', '--remote', '--command', sql, '--json'],
  { cwd: path.join(process.cwd(), 'worker-airtrust'), encoding: 'utf8', env: process.env },
);
if (result.status !== 0) {
  process.stderr.write(`wrangler failed with code ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}\n`);
  process.exit(1);
}
let parsed;
try {
  parsed = JSON.parse(result.stdout);
} catch {
  const start = result.stdout.indexOf('[');
  const end = result.stdout.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error(`D1_JSON_NOT_FOUND:${result.stdout}`);
  parsed = JSON.parse(result.stdout.slice(start, end + 1));
}
const rows = Array.isArray(parsed) ? parsed[0]?.results : parsed?.results;
const row = rows?.[0];
const value = row?.count ?? row?.COUNT ?? row?.total ?? row?.TOTAL ?? row?.['COUNT(*)'] ?? row?.['count(*)'] ?? (row ? Object.values(row)[0] : NaN);
const count = Number(value);
if (!Number.isInteger(count) || count < 0) throw new Error(`INVALID_COUNT:${JSON.stringify(parsed)}`);
process.stdout.write(String(count));
NODE
}

assert_count() {
  local label="$1"
  local expected="$2"
  local sql="$3"
  local observed
  observed="$(query_count "$sql")"
  if [[ "$observed" != "$expected" ]]; then
    echo "ERROR: $label expected=$expected observed=$observed" >&2
    exit 1
  fi
  echo "LEGACY_0438_OK=$label:$observed"
}

# Historical ledger shape must remain visible; this validator never repairs it.
assert_count "d1-ledger" 1 \
  "SELECT COUNT(*) AS count FROM d1_migrations WHERE name = '$MIGRATION_NAME';"
assert_count "schema-v2-ledger-intentionally-absent" 0 \
  "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id = '$CHANGE_ID';"
assert_count "active-baseline" 1 \
  "SELECT COUNT(*) AS count FROM airtrust_schema_baselines_v2 WHERE baseline_id = '$BASELINE_ID' AND status = 'ACTIVE';"

# Seven reviewed physical markers from the 0438 plan.
assert_count "cv_rdv_operacional.workflow_status" 1 \
  "SELECT COUNT(*) AS count FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'workflow_status';"
assert_count "cv_rdv_operacional.versao" 1 \
  "SELECT COUNT(*) AS count FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'versao';"
for table in cv_rdv_aprovacoes cv_rdv_revisoes cv_rdv_alertas cv_voo_abastecimentos; do
  assert_count "table:$table" 1 \
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = '$table';"
done
assert_count "index:idx_cv_voo_etapas_empresa_voo_numero_unique" 1 \
  "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'idx_cv_voo_etapas_empresa_voo_numero_unique';"

# Defaults and every safety trigger required by the reviewed postconditions.
assert_count "workflow_status.default.rascunho" 1 \
  "SELECT COUNT(*) AS count FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'workflow_status' AND replace(dflt_value, char(39), '') = 'rascunho';"
assert_count "versao.default.1" 1 \
  "SELECT COUNT(*) AS count FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'versao' AND CAST(dflt_value AS INTEGER) = 1;"

for trigger in \
  trg_cv_rdv_operacional_workflow_status_insert \
  trg_cv_rdv_operacional_workflow_status_update \
  trg_cv_rdv_operacional_versao_insert \
  trg_cv_rdv_operacional_versao_update \
  trg_cv_rdv_aprovacoes_rdv_insert \
  trg_cv_rdv_aprovacoes_no_update \
  trg_cv_rdv_revisoes_rdv_insert \
  trg_cv_rdv_revisoes_no_update \
  trg_cv_rdv_alertas_rdv_insert \
  trg_cv_rdv_alertas_etapa_insert \
  trg_cv_rdv_alertas_keys_immutable \
  trg_cv_voo_abastecimentos_voo_insert \
  trg_cv_voo_abastecimentos_etapa_insert \
  trg_cv_voo_abastecimentos_keys_immutable; do
  assert_count "trigger:$trigger" 1 \
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'trigger' AND name = '$trigger';"
done

assert_count "active-stage-duplicate-groups" 0 \
  "SELECT COUNT(*) AS count FROM (SELECT empresa_id, voo_id, numero_etapa FROM cv_voo_etapas WHERE deleted_at IS NULL GROUP BY empresa_id, voo_id, numero_etapa HAVING COUNT(*) > 1);"

# Aggregate-only evidence; no row content is extracted.
for table in cv_rdv_operacional cv_rdv_aprovacoes cv_rdv_revisoes cv_rdv_alertas cv_voo_etapas; do
  count="$(query_count "SELECT COUNT(*) AS count FROM $table;")"
  echo "LEGACY_0438_AGGREGATE:$table=$count"
done
active_etapas="$(query_count "SELECT COUNT(*) AS count FROM cv_voo_etapas WHERE deleted_at IS NULL;")"
echo "LEGACY_0438_AGGREGATE:cv_voo_etapas_active=$active_etapas"

echo "RDV_0438_LEGACY_PHYSICAL_STATE=PASS"
echo "RDV_0438_SCHEMA_V2_LEDGER_RECONCILED=NO"
