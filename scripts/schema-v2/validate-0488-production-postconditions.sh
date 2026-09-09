#!/usr/bin/env bash
# Read-only production postconditions for reviewed Schema V2 change 0488.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db"
BASELINE_ID="production-d1-baseline-v2-20260714"
CHANGE_ID="controle-voos-pilot-offline-sync-receipts-0488"
target="$ALLOWED_DB_NAME"

for arg in "$@"; do
  case "$arg" in
    --target=*) target="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

if [[ "$target" != "$ALLOWED_DB_NAME" ]]; then
  echo "ERROR: 0488 production postvalidator refused target: $target" >&2
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

assert_one() {
  local label="$1"
  local sql="$2"
  local count
  count="$(query_count "$sql")"
  [[ "$count" == "1" ]] || { echo "ERROR: $label expected=1 found=$count" >&2; exit 1; }
  echo "POSTCONDITION_OK=$label"
}

assert_one "schema-v2-baseline:$BASELINE_ID" "SELECT COUNT(*) AS count FROM airtrust_schema_baselines_v2 WHERE baseline_id = '$BASELINE_ID' AND status = 'ACTIVE';"
assert_one "schema-v2-change:$CHANGE_ID" "SELECT COUNT(*) AS count FROM airtrust_schema_changes_v2 WHERE change_id = '$CHANGE_ID';"
assert_one "table:cv_offline_sync_receipts" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'cv_offline_sync_receipts';"

for column in id empresa_id client_operation_id voo_id usuario_id funcionario_id device_id command_type entity_type canonical_entity_id payload_hash base_server_version server_entity_version result_status result_code result_json received_at updated_at; do
  assert_one "column:cv_offline_sync_receipts.$column" "SELECT COUNT(*) AS count FROM pragma_table_info('cv_offline_sync_receipts') WHERE name = '$column';"
done

assert_one "index:uq_cv_offline_sync_receipts_empresa_operation" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'uq_cv_offline_sync_receipts_empresa_operation';"
assert_one "index:idx_cv_offline_sync_receipts_voo_received" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'idx_cv_offline_sync_receipts_voo_received';"
assert_one "index:idx_cv_offline_sync_receipts_actor_device" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'index' AND name = 'idx_cv_offline_sync_receipts_actor_device';"
assert_one "unique-index:empresa-operation" "SELECT COUNT(*) AS count FROM pragma_index_list('cv_offline_sync_receipts') WHERE name = 'uq_cv_offline_sync_receipts_empresa_operation' AND \"unique\" = 1;"
assert_one "result-status-check" "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'cv_offline_sync_receipts' AND sql LIKE '%accepted%' AND sql LIKE '%conflict%' AND sql LIKE '%rejected_retriable%' AND sql LIKE '%rejected_permanent%';"

echo "CONTROLE_VOOS_PILOT_OFFLINE_SYNC_RECEIPTS_0488_PRODUCTION_POSTCONDITIONS=PASS"
