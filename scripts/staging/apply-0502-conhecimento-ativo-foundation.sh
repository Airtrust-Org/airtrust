#!/usr/bin/env bash
# source_reference: worker-airtrust/schema-v2/conhecimento-ativo-foundation-0502.json
# operational_decision: staging-only governed Schema V2 runner; dry-run unless --apply
# dry_run_required: true
# rollback_plan_required: worker-airtrust/schema-v2/plans/conhecimento-ativo-foundation-0502.md
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
MIGRATION_BASENAME="0502_conhecimento_ativo_foundation.sql"
SCHEMA_CHANGE_ID="conhecimento-ativo-foundation-0502"

apply=false
migration_arg=""
for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --migration=*) migration_arg="${arg#*=}" ;;
    *) echo "ERROR: unknown argument: $arg" >&2; exit 1 ;;
  esac
done

expected_path="release/worker-airtrust/migrations/$MIGRATION_BASENAME"
[[ "$migration_arg" == "$expected_path" ]] || {
  echo "ERROR: 0502 requires exact path $expected_path" >&2
  exit 1
}
[[ ! -L "$migration_arg" && -f "$migration_arg" ]] || {
  echo "ERROR: migration 0502 missing or symlink refused" >&2
  exit 1
}
if ! git -C release diff --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME" ||    ! git -C release diff --cached --quiet -- "worker-airtrust/migrations/$MIGRATION_BASENAME"; then
  echo "ERROR: migration 0502 has uncommitted release changes" >&2
  exit 1
fi

db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
[[ "$db_name" == "$ALLOWED_DB_NAME" && "$db_id" == "$ALLOWED_DB_ID" && "$db_id" != "$BLOCKED_PRODUCTION_DB_ID" ]] || {
  echo "ERROR: target is not official staging D1" >&2
  exit 1
}

manifest_path="release/worker-airtrust/schema-v2/$SCHEMA_CHANGE_ID.json"
schema_sql_path="release/worker-airtrust/schema-v2/changes/$MIGRATION_BASENAME"
plan_path="release/worker-airtrust/schema-v2/plans/conhecimento-ativo-foundation-0502.md"
for path in "$manifest_path" "$schema_sql_path" "$plan_path"; do
  [[ ! -L "$path" && -f "$path" ]] || {
    echo "ERROR: reviewed Schema V2 artifact missing: $path" >&2
    exit 1
  }
done
cmp -s "$migration_arg" "$schema_sql_path" || {
  echo "ERROR: canonical migration diverges from reviewed Schema V2 SQL" >&2
  exit 1
}

sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}
sql_hash="$(sha256 "$migration_arg")"
plan_hash="$(sha256 "$plan_path")"

node - "$manifest_path" "$sql_hash" "$plan_hash" <<'NODE'
const fs = require('node:fs');
const [,, path, sqlHash, planHash] = process.argv;
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
if (
  manifest.changeId !== 'conhecimento-ativo-foundation-0502' ||
  manifest.baselineId !== 'production-d1-baseline-v2-20260714' ||
  manifest.filePath !== 'worker-airtrust/schema-v2/changes/0502_conhecimento_ativo_foundation.sql' ||
  manifest.planPath !== 'worker-airtrust/schema-v2/plans/conhecimento-ativo-foundation-0502.md' ||
  manifest.fileHash !== sqlHash ||
  manifest.planHash !== planHash
) {
  throw new Error('REVIEWED_MANIFEST_MISMATCH');
}
NODE

query_count() {
  local sql="$1"
  node - "$db_name" "$sql" <<'NODE'
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const [,, db, sql] = process.argv;
const result = spawnSync(
  'npx',
  ['wrangler', 'd1', 'execute', db, '--remote', '--json', '--command', sql],
  { cwd: path.join(process.cwd(), 'worker-airtrust'), encoding: 'utf8', env: process.env },
);
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(1);
}
const start = result.stdout.indexOf('[');
const end = result.stdout.lastIndexOf(']');
const payload = JSON.parse(start >= 0 && end > start ? result.stdout.slice(start, end + 1) : result.stdout);
const row = (Array.isArray(payload) ? payload[0]?.results : payload?.results)?.[0];
const value = Number(row?.count ?? row?.total ?? row?.['COUNT(*)'] ?? (row ? Object.values(row)[0] : NaN));
if (!Number.isInteger(value) || value < 0) throw new Error('INVALID_COUNT');
process.stdout.write(String(value));
NODE
}

for table in usuarios funcionarios aeronaves funcionarios_aeronaves modelos_aeronave d1_migrations; do
  [[ "$(query_count "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name='$table';")" == 1 ]] || {
    echo "ERROR: prerequisite $table missing" >&2
    exit 1
  }
done

ledger_count="$(query_count "SELECT COUNT(*) count FROM d1_migrations WHERE name='$MIGRATION_BASENAME';")"
table_count="$(query_count "SELECT COUNT(*) count FROM sqlite_master WHERE type='table' AND name LIKE 'conhecimento_ativo_%';")"
trigger_count="$(query_count "SELECT COUNT(*) count FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_ca_%';")"

if [[ "$ledger_count" == 1 ]]; then
  bash scripts/staging/validate-0502-postconditions.sh --target="$db_name"
  echo "MIGRATION_ALREADY_APPLIED_AND_VALIDATED=$MIGRATION_BASENAME"
  exit 0
fi

[[ "$ledger_count" == 0 && "$table_count" == 0 && "$trigger_count" == 0 ]] || {
  echo "ERROR: 0502 schema/ledger drift or partial apply" >&2
  exit 1
}

args=(--migration="$migration_arg")
$apply && args+=(--apply)
exec bash "$ROOT/scripts/staging/apply-approved-migration-with-recovery-point.sh" "${args[@]}"
