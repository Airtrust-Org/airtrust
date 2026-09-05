#!/usr/bin/env bash
# Read-only fail-closed production preflight for reviewed Schema V2 change 0438.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db"
BASELINE_ID="production-d1-baseline-v2-20260714"
CHANGE_ID="0438-rdv-coordination-workflow-production"
target="$ALLOWED_DB_NAME"

for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [[ "$target" != "$ALLOWED_DB_NAME" ]]; then
  echo "ERROR: 0438 production preflight refused non-production target: $target" >&2
  exit 1
fi

query_count() {
  local sql="$1"
  node - "$target" "$sql" <<'NODE'
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const [,, dbName, sql] = process.argv;
const res = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', dbName, '--env', 'production', '--remote', '--json', '--command', sql],
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
const value = row?.count ?? row?.COUNT ?? row?.total ?? row?.TOTAL ?? row?.['COUNT(*)'] ?? row?.['count(*)'] ?? (row ? Object.values(row)[0] : NaN);
const count = Number(value);
if (!Number.isInteger(count) || count < 0) throw new Error(`INVALID_COUNT:${JSON.stringify(parsed)}`);
process.stdout.write(String(count));
NODE
}

baseline_count="$(query_count "SELECT COUNT(*) AS count FROM airtrust_schema_baselines_v2 WHERE baseline_id = '$BASELINE_ID' AND status = 'ACTIVE';")"
[[ "$baseline_count" == "1" ]] || { echo "ERROR: expected one active Schema V2 baseline $BASELINE_ID, found $baseline_count" >&2; exit 1; }

change_count="$(query_count "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id = '$CHANGE_ID';")"
[[ "$change_count" == "0" ]] || { echo "ERROR: $CHANGE_ID already exists in Schema V2 ledger" >&2; exit 1; }

marker_counts=(
  "$(query_count "SELECT COUNT(*) AS count FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'workflow_status';")"
  "$(query_count "SELECT COUNT(*) AS count FROM pragma_table_info('cv_rdv_operacional') WHERE name = 'versao';")"
  "$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'cv_rdv_aprovacoes';")"
  "$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'cv_rdv_revisoes';")"
  "$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'cv_rdv_alertas';")"
  "$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'cv_voo_abastecimentos';")"
  "$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'idx_cv_voo_etapas_empresa_voo_numero_unique';")"
)

markers_present=0
for count in "${marker_counts[@]}"; do
  [[ "$count" == "0" || "$count" == "1" ]] || { echo "ERROR: invalid marker count: $count" >&2; exit 1; }
  markers_present=$((markers_present + count))
done
echo "MARKERS_PRESENT=$markers_present/7"

if [[ "$markers_present" -ne 0 ]]; then
  if [[ "$markers_present" -eq 7 ]]; then
    echo "ERROR: COMPLETE_SCHEMA_WITHOUT_LEDGER_OR_ALREADY_APPLIED: all 0438 markers are already present while ledger precondition expected zero." >&2
  else
    echo "ERROR: PARTIAL_SCHEMA_STATE: $markers_present/7 reviewed 0438 markers are present." >&2
  fi
  exit 1
fi

duplicates="$(query_count "SELECT COUNT(*) AS count FROM (SELECT empresa_id, voo_id, numero_etapa FROM cv_voo_etapas WHERE deleted_at IS NULL GROUP BY empresa_id, voo_id, numero_etapa HAVING COUNT(*) > 1);")"
[[ "$duplicates" == "0" ]] || { echo "ERROR: ACTIVE_STAGE_DUPLICATE_GROUPS=$duplicates" >&2; exit 1; }

rdv_count="$(query_count "SELECT COUNT(*) AS count FROM cv_rdv_operacional;")"
stage_count="$(query_count "SELECT COUNT(*) AS count FROM cv_voo_etapas;")"
active_stage_count="$(query_count "SELECT COUNT(*) AS count FROM cv_voo_etapas WHERE deleted_at IS NULL;")"
rdv_table_count="$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name LIKE 'cv_rdv_%';")"

echo "RDV_0438_PRODUCTION_PREFLIGHT=PASS"
echo "RDV_OPERACIONAL_COUNT=$rdv_count"
echo "VOO_ETAPAS_COUNT=$stage_count"
echo "ACTIVE_VOO_ETAPAS_COUNT=$active_stage_count"
echo "RDV_TABLE_COUNT=$rdv_table_count"
