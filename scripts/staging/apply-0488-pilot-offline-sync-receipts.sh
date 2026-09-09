#!/usr/bin/env bash
# Governed staging-only application path for 0488 Pilot offline sync receipts.
# Default mode is dry-run: verifies exact reviewed SQL/manifest/hash, target,
# prerequisites and ledgers without a remote write. --apply is explicit.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
CONFIRMATION_PHRASE="AIRTRUST_STAGING_SCHEMA_CHANGE"
MIGRATION_BASENAME="0488_controle_voos_pilot_offline_sync_receipts.sql"
SCHEMA_CHANGE_ID="controle-voos-pilot-offline-sync-receipts-0488"

apply=false
migration_arg=""

for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --migration=*) migration_arg="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg" >&2; exit 1 ;;
  esac
done

expected_path="release/worker-airtrust/migrations/$MIGRATION_BASENAME"
if [[ "$migration_arg" != "$expected_path" ]]; then
  echo "ERROR: 0488 exige caminho exato $expected_path." >&2
  exit 1
fi
if [[ -L "$migration_arg" || ! -f "$migration_arg" ]]; then
  echo "ERROR: migration 0488 ausente ou symlink recusado." >&2
  exit 1
fi
if ! git -C release diff --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME" ||    ! git -C release diff --cached --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME"; then
  echo "ERROR: migration 0488 possui alteracao local nao commitada." >&2
  exit 1
fi

release_sha="$(git -C release rev-parse HEAD)"
db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
if [[ "$db_name" != "$ALLOWED_DB_NAME" || "$db_id" != "$ALLOWED_DB_ID" ]]; then
  echo "ERROR: alvo nao corresponde ao D1 oficial de staging." >&2
  exit 1
fi
if [[ "$db_id" == "$BLOCKED_PRODUCTION_DB_ID" || "$db_name" == "airtrust-db" ]]; then
  echo "ERROR: alvo de producao recusado." >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  sql_sha256="$(shasum -a 256 "$migration_arg" | awk '{print $1}')"
else
  sql_sha256="$(sha256sum "$migration_arg" | awk '{print $1}')"
fi
printf 'MIGRATION=%s\nRELEASE_SHA=%s\nSQL_SHA256=%s\nTARGET_DB=%s\n'   "$MIGRATION_BASENAME" "$release_sha" "$sql_sha256" "$db_name"

manifest_path="release/worker-airtrust/schema-v2/$SCHEMA_CHANGE_ID.json"
schema_sql_path="release/worker-airtrust/schema-v2/changes/$MIGRATION_BASENAME"
plan_path="release/worker-airtrust/schema-v2/plans/controle-voos-pilot-offline-sync-receipts-0488.md"
if [[ -L "$manifest_path" || ! -f "$manifest_path" ||       -L "$schema_sql_path" || ! -f "$schema_sql_path" ||       -L "$plan_path" || ! -f "$plan_path" ]]; then
  echo "ERROR: artefatos Schema V2 revisados da 0488 ausentes ou invalidos." >&2
  exit 1
fi
if ! cmp -s "$migration_arg" "$schema_sql_path"; then
  echo "ERROR: SQL canonico da 0488 diverge do SQL Schema V2 revisado." >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  plan_sha256="$(shasum -a 256 "$plan_path" | awk '{print $1}')"
else
  plan_sha256="$(sha256sum "$plan_path" | awk '{print $1}')"
fi

node - "$manifest_path" "$sql_sha256" "$plan_sha256" "$SCHEMA_CHANGE_ID" <<'NODE'
const fs = require('node:fs');
const [,, manifestPath, sqlHash, planHash, expectedChangeId] = process.argv;
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.changeId !== expectedChangeId) throw new Error('SCHEMA_V2_CHANGE_ID_MISMATCH');
if (manifest.baselineId !== 'production-d1-baseline-v2-20260714') {
  throw new Error('SCHEMA_V2_BASELINE_ID_MISMATCH');
}
if (
  manifest.filePath !==
  'worker-airtrust/schema-v2/changes/0488_controle_voos_pilot_offline_sync_receipts.sql'
) throw new Error('SCHEMA_V2_FILE_PATH_MISMATCH');
if (
  manifest.planPath !==
  'worker-airtrust/schema-v2/plans/controle-voos-pilot-offline-sync-receipts-0488.md'
) throw new Error('SCHEMA_V2_PLAN_PATH_MISMATCH');
if (manifest.fileHash !== sqlHash) throw new Error('SCHEMA_V2_FILE_HASH_MISMATCH');
if (manifest.planHash !== planHash) throw new Error('SCHEMA_V2_PLAN_HASH_MISMATCH');
NODE
echo "SCHEMA_V2_REVIEWED_SQL_CONFIRMED=$SCHEMA_CHANGE_ID"

preflight_output="$(mktemp -t airtrust-staging-0488-preflight.XXXXXXXX)"
recovery_output="$(mktemp -t airtrust-staging-0488-recovery.XXXXXXXX)"
combined_sql="$(mktemp -t airtrust-staging-0488-ledger.XXXXXXXX.sql)"
trap 'rm -f "$preflight_output" "$recovery_output" "$combined_sql"' EXIT

query_count() {
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
const start = res.stdout.indexOf('[');
const end = res.stdout.lastIndexOf(']');
const parsed = JSON.parse(start >= 0 && end > start ? res.stdout.slice(start, end + 1) : res.stdout);
const results = Array.isArray(parsed) ? parsed[0]?.results : parsed?.results;
const row = results?.[0];
const value = row?.count ?? row?.COUNT ?? row?.total ?? row?.TOTAL ?? row?.['COUNT(*)'] ?? row?.['count(*)'];
const count = Number(value);
if (!Number.isInteger(count) || count < 0) {
  process.stderr.write(`Invalid count result: ${JSON.stringify(parsed)}\n`);
  process.exit(1);
}
process.stdout.write(String(count));
NODE
}

for prerequisite in cv_voos cv_rdv_operacional cv_voo_etapas usuarios; do
  count="$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='$prerequisite';")"
  [[ "$count" == "1" ]] || {
    echo "ERROR: prerequisite table $prerequisite is absent in staging." >&2
    exit 1
  }
done
echo "PREREQUISITE_TABLES_VALIDATED=true"

echo "Executando preflight de ledger somente leitura para 0488..."
if ! node scripts/staging/migration-ledger-preflight.mjs --scope="0488" > "$preflight_output"; then
  echo "ERROR: preflight de ledger recusou 0488." >&2
  cat "$preflight_output" >&2
  exit 1
fi
echo "PREFLIGHT_OK=true"

ledger_count="$(query_count "SELECT COUNT(*) AS count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';")"
table_count="$(query_count "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='cv_offline_sync_receipts';")"

if [[ "$ledger_count" == "1" ]]; then
  if [[ "$table_count" != "1" ]]; then
    echo "ERROR: ledger 0488 existe sem tabela correspondente." >&2
    exit 1
  fi
  bash scripts/staging/validate-0488-pilot-offline-sync-receipts.sh --target="$db_name"
  echo "MIGRATION_ALREADY_APPLIED_AND_VALIDATED=$MIGRATION_BASENAME"
  echo "RECOVERY_POINT_CAPTURED=false"
  exit 0
fi
if [[ "$ledger_count" != "0" ]]; then
  echo "ERROR: ledger contem $ledger_count entradas para 0488; esperado 0 ou 1." >&2
  exit 1
fi
if [[ "$table_count" != "0" ]]; then
  echo "ERROR: CV_OFFLINE_SYNC_RECEIPTS_SCHEMA_DRIFT: tabela existe sem ledger 0488." >&2
  exit 1
fi

node --input-type=module - "$migration_arg" "$MIGRATION_BASENAME" "$combined_sql" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { buildLedgerAppliedSql } from './worker-airtrust/scripts/lib/migration-remote-apply.mjs';

const [migrationPath, migrationName, outputPath] = process.argv.slice(2);
const migrationSql = readFileSync(migrationPath, 'utf8');
writeFileSync(
  outputPath,
  buildLedgerAppliedSql({ migrationSql, migrationName }),
  { encoding: 'utf8', mode: 0o600 },
);
NODE
test -s "$combined_sql"

if ! $apply; then
  echo "DRY_RUN=true"
  echo "REMOTE_WRITE_EXECUTED=false"
  exit 0
fi
if [[ "${CONFIRM_STAGING_SCHEMA_CHANGE:-}" != "$CONFIRMATION_PHRASE" ]]; then
  echo "ERROR: confirmacao operacional ausente ou incorreta." >&2
  exit 1
fi

recovery_timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Capturando ponto de recuperacao D1 Time Travel..."
(
  cd worker-airtrust
  npx wrangler d1 time-travel info "$db_name"     --timestamp="$recovery_timestamp"     --json > "$recovery_output"
)
test -s "$recovery_output"
node - "$recovery_output" <<'NODE'
const fs = require('node:fs');
const parsed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!/bookmark/i.test(JSON.stringify(parsed))) {
  throw new Error('TIME_TRAVEL_BOOKMARK_NOT_CONFIRMED');
}
NODE
echo "RECOVERY_TIMESTAMP_UTC=$recovery_timestamp"
echo "RECOVERY_POINT_CAPTURED=true"

apply_status=0
(
  cd worker-airtrust
  npx wrangler d1 execute "$db_name" --remote --file="$combined_sql"
) || apply_status=$?
if [[ $apply_status -ne 0 ]]; then
  echo "MIGRATION_FAILED=$MIGRATION_BASENAME" >&2
  exit "$apply_status"
fi

ledger_count="$(query_count "SELECT COUNT(*) AS count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';")"
[[ "$ledger_count" == "1" ]] || {
  echo "ERROR: migration executada sem entrada unica no ledger ($ledger_count)." >&2
  exit 1
}
echo "LEDGER_ENTRY_CONFIRMED=$MIGRATION_BASENAME"

bash scripts/staging/validate-0488-pilot-offline-sync-receipts.sh --target="$db_name"
echo "MIGRATION_APPLIED_AND_VALIDATED=$MIGRATION_BASENAME"
