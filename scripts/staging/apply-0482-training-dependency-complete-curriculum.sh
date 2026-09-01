#!/usr/bin/env bash
# Governed staging-only application path for 0482_training_dependency_complete_curriculum.sql.
# source_reference: PR #227 / training dependency complete curriculum follow-up
# operational_decision: apply the reviewed 0482 Schema V2 bundle only after 0481 is present and validated in official staging.
# dry_run_required: default mode performs target/path/hash/prerequisite/ledger preflight only; --apply is explicit.
# rollback_plan_required: scripts/rollback/0482_training_dependency_complete_curriculum.sql
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
CONFIRMATION_PHRASE="AIRTRUST_STAGING_SCHEMA_CHANGE"
MIGRATION_BASENAME="0482_training_dependency_complete_curriculum.sql"
PREREQUISITE_MIGRATION="0481_training_dependency_planning.sql"
SCHEMA_CHANGE_ID="training-dependency-complete-curriculum-0482"

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
  echo "ERROR: 0482 exige caminho exato $expected_path." >&2
  exit 1
fi
if [[ -L "$migration_arg" || ! -f "$migration_arg" ]]; then
  echo "ERROR: migration 0482 ausente ou symlink recusado." >&2
  exit 1
fi
if ! git -C release diff --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME" || \
   ! git -C release diff --cached --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME"; then
  echo "ERROR: migration 0482 possui alteração local não commitada." >&2
  exit 1
fi

release_sha="$(git -C release rev-parse HEAD)"
db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
if [[ "$db_name" != "$ALLOWED_DB_NAME" || "$db_id" != "$ALLOWED_DB_ID" ]]; then
  echo "ERROR: alvo não corresponde ao D1 oficial de staging." >&2
  exit 1
fi
if [[ "$db_id" == "$BLOCKED_PRODUCTION_DB_ID" || "$db_name" == "airtrust-db" ]]; then
  echo "ERROR: alvo de produção recusado." >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  sql_sha256="$(shasum -a 256 "$migration_arg" | awk '{print $1}')"
else
  sql_sha256="$(sha256sum "$migration_arg" | awk '{print $1}')"
fi
printf 'MIGRATION=%s\nRELEASE_SHA=%s\nSQL_SHA256=%s\nTARGET_DB=%s\n' \
  "$MIGRATION_BASENAME" "$release_sha" "$sql_sha256" "$db_name"

# Staging executes the same reviewed SQL pinned for production. Any drift in
# file path, change id or SHA-256 fails closed before a remote write.
manifest_path="release/worker-airtrust/schema-v2/$SCHEMA_CHANGE_ID.json"
schema_sql_path="release/worker-airtrust/schema-v2/changes/$MIGRATION_BASENAME"
if [[ -L "$manifest_path" || ! -f "$manifest_path" || -L "$schema_sql_path" || ! -f "$schema_sql_path" ]]; then
  echo "ERROR: artefatos Schema V2 revisados da 0482 estão ausentes ou inválidos." >&2
  exit 1
fi
if ! cmp -s "$migration_arg" "$schema_sql_path"; then
  echo "ERROR: SQL canônico da 0482 diverge do SQL Schema V2 revisado." >&2
  exit 1
fi
node - "$manifest_path" "$sql_sha256" "$SCHEMA_CHANGE_ID" <<'NODE'
const fs = require('node:fs');
const [,, manifestPath, sqlHash, expectedChangeId] = process.argv;
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.changeId !== expectedChangeId) throw new Error('SCHEMA_V2_CHANGE_ID_MISMATCH');
if (manifest.filePath !== 'worker-airtrust/schema-v2/changes/0482_training_dependency_complete_curriculum.sql') {
  throw new Error('SCHEMA_V2_FILE_PATH_MISMATCH');
}
if (manifest.fileHash !== sqlHash) throw new Error('SCHEMA_V2_FILE_HASH_MISMATCH');
NODE
echo "SCHEMA_V2_REVIEWED_SQL_CONFIRMED=$SCHEMA_CHANGE_ID"

preflight_output="$(mktemp -t airtrust-staging-0482-preflight.XXXXXXXX)"
recovery_output="$(mktemp -t airtrust-staging-0482-recovery.XXXXXXXX)"
combined_sql="$(mktemp -t airtrust-staging-0482-ledger.XXXXXXXX.sql)"
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
  { cwd: path.join(process.cwd(), 'worker-airtrust'), encoding: 'utf8', env: process.env }
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

# 0482 is a follow-up to 0481. Never enrich dependency snapshots on a staging
# database where the prerequisite migration is absent or ambiguous.
prerequisite_count="$(query_count "SELECT COUNT(*) AS count FROM d1_migrations WHERE name = '$PREREQUISITE_MIGRATION';")"
if [[ "$prerequisite_count" != "1" ]]; then
  echo "ERROR: 0482 requer ledger único da 0481; encontrado $prerequisite_count." >&2
  exit 1
fi
bash scripts/staging/validate-0481-postconditions.sh --target="$db_name"
echo "PREREQUISITE_0481_VALIDATED=true"

echo "Executando preflight de ledger somente leitura para 0482..."
if ! node scripts/staging/migration-ledger-preflight.mjs --scope="0482" > "$preflight_output"; then
  echo "ERROR: preflight de ledger recusou 0482." >&2
  cat "$preflight_output" >&2
  exit 1
fi
echo "PREFLIGHT_OK=true"

ledger_count="$(query_count "SELECT COUNT(*) AS count FROM d1_migrations WHERE name = '$MIGRATION_BASENAME';")"
if [[ "$ledger_count" == "1" ]]; then
  bash scripts/staging/validate-0482-postconditions.sh --target="$db_name"
  echo "MIGRATION_ALREADY_APPLIED_AND_VALIDATED=$MIGRATION_BASENAME"
  echo "RECOVERY_POINT_CAPTURED=false"
  exit 0
fi
if [[ "$ledger_count" != "0" ]]; then
  echo "ERROR: ledger contém $ledger_count entradas para 0482; esperado 0 ou 1." >&2
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
  exit 0
fi
if [[ "${CONFIRM_STAGING_SCHEMA_CHANGE:-}" != "$CONFIRMATION_PHRASE" ]]; then
  echo "ERROR: confirmação operacional ausente ou incorreta." >&2
  exit 1
fi

recovery_timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Capturando ponto de recuperação D1 Time Travel..."
(
  cd worker-airtrust
  npx wrangler d1 time-travel info "$db_name" \
    --timestamp="$recovery_timestamp" \
    --json > "$recovery_output"
)
test -s "$recovery_output"
node - "$recovery_output" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
const serialized = JSON.stringify(parsed);
if (!/bookmark/i.test(serialized)) throw new Error('TIME_TRAVEL_BOOKMARK_NOT_CONFIRMED');
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

ledger_count="$(query_count "SELECT COUNT(*) AS count FROM d1_migrations WHERE name = '$MIGRATION_BASENAME';")"
if [[ "$ledger_count" != "1" ]]; then
  echo "ERROR: migration executada sem entrada única no ledger ($ledger_count)." >&2
  exit 1
fi
echo "LEDGER_ENTRY_CONFIRMED=$MIGRATION_BASENAME"

bash scripts/staging/validate-0482-postconditions.sh --target="$db_name"
echo "MIGRATION_APPLIED_AND_VALIDATED=$MIGRATION_BASENAME"
