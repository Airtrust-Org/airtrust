#!/usr/bin/env bash
set -euo pipefail

# Reviewed procedure for applying one canonical forward migration to production
# D1. This wrapper never enumerates worker-airtrust/migrations and refuses
# rollback/manual/preflight/purge artifacts and NO_GO_MIGRATION_PRODUCAO files.

CONFIRM_TEXT="I understand this may modify production data"
CANONICAL_NAME_RE='^[0-9]{4}_[a-z0-9_]+\.sql$'

echo "⚠️  PRODUCTION MIGRATION APPLY PATH"
echo "   This script executes exactly one reviewed canonical migration against production D1."
echo "   It is blocked unless all explicit production DB write gates are set,"
echo "   and unconditionally blocked for migrations marked NO_GO_MIGRATION_PRODUCAO."

if [[ $# -ne 1 ]]; then
  echo "ERROR: usage: bash scripts/apply-migration-production.sh worker-airtrust/migrations/XXXX_name.sql"
  exit 1
fi

migration_file="$1"

case "$migration_file" in
  worker-airtrust/migrations/*.sql) ;;
  *)
    echo "ERROR: migration_file must be under worker-airtrust/migrations/ and end in .sql: $migration_file" >&2
    exit 1
    ;;
esac

migration_name="$(basename "$migration_file")"
if [[ ! "$migration_name" =~ $CANONICAL_NAME_RE ]]; then
  echo "ERROR: migration filename is not canonical forward SQL: $migration_name" >&2
  echo "Expected pattern: ^[0-9]{4}_[a-z0-9_]+\\.sql$" >&2
  exit 1
fi

migration_name_lower="$(printf '%s' "$migration_name" | tr '[:upper:]' '[:lower:]')"
case "$migration_name_lower" in
  *rollback*|*purge*|*preflight*|*manual*|*diagnostic*|*diagnostico*)
    echo "ERROR: operational/destructive SQL is not eligible for the production migration wrapper: $migration_name" >&2
    exit 1
    ;;
esac

if [[ -L "$migration_file" ]]; then
  echo "ERROR: symlink migrations are not permitted: $migration_file" >&2
  exit 1
fi

if [[ ! -f "$migration_file" ]]; then
  echo "ERROR: migration file not found: $migration_file" >&2
  exit 1
fi

# Migrations with known ledger or execution constraints must NEVER be applied
# through this raw `d1 execute --remote --file` path. Each case below points to
# the reviewed, ledger-aware path that must be prepared or used instead.
case "$migration_name" in
  0438_controle_voos_rdv_coordenacao_workflow.sql)
    echo "ERROR: 0438 must not be applied via raw d1 execute." >&2
    echo "Prepare and review the Schema V2 bundle described in:" >&2
    echo "  worker-airtrust/schema-v2/plans/0438-rdv-coordination-workflow-production.md" >&2
    echo "Then apply it only through .github/workflows/apply-schema-change-v2.yml." >&2
    exit 4
    ;;
  0440_simuladores_matriz_versionada_metadata.sql)
    echo "ERROR: 0440 must not be (re)applied via raw d1 execute." >&2
    echo "It was already physically applied; reconcile its ledger entry with:" >&2
    echo "  node scripts/production/reconcile-simuladores-0440-ledger.mjs --apply ..." >&2
    exit 4
    ;;
  0441_simuladores_matriz_manobra_resolution.sql|0442_simuladores_matriz_guia_relink.sql)
    echo "ERROR: $migration_name must be applied via the exact governed runner:" >&2
    echo "  bash scripts/production/apply-simuladores-matriz-remote-migration.sh $migration_name" >&2
    exit 4
    ;;
  0443_simuladores_matriz_remediation_compensation.sql)
    echo "ERROR: 0443 must be applied via its dedicated ledger-aware runner:" >&2
    echo "  bash scripts/production/apply-simuladores-matriz-0443-remote-migration.sh $migration_name" >&2
    exit 4
    ;;
esac

no_go_check="$(node scripts/check-single-migration-no-go.mjs "$migration_file")"
if [[ "$no_go_check" == "BLOCKED" ]]; then
  echo "ERROR: $migration_file is marked NO_GO_MIGRATION_PRODUCAO." >&2
  echo "This migration cannot be applied to production through this script." >&2
  echo "There is no override flag. The marker must be removed via a reviewed PR before this can run." >&2
  exit 3
fi

# Fail closed if the canonical directory itself is impure before any production
# gate or remote command can be reached.
node scripts/guard-migrations-dir-purity.mjs >/dev/null

db_env="${AIRTRUST_D1_ENV:-production}"
db_name="${AIRTRUST_D1_DATABASE:-airtrust-db}"

if [[ "$db_env" != "production" && "${AIRTRUST_ALLOW_NON_PROD_DB_ENV:-}" != "YES" ]]; then
  echo "ERROR: AIRTRUST_D1_ENV must be production unless AIRTRUST_ALLOW_NON_PROD_DB_ENV=YES is set"
  echo "Current AIRTRUST_D1_ENV: $db_env"
  exit 1
fi

if [[ "${AIRTRUST_ALLOW_PROD_DB_WRITE:-}" != "YES" ]]; then
  echo "ERROR: set AIRTRUST_ALLOW_PROD_DB_WRITE=YES to continue"
  exit 1
fi

if [[ "${AIRTRUST_CONFIRM_PROD_DB_WRITE:-}" != "$CONFIRM_TEXT" ]]; then
  echo "ERROR: set AIRTRUST_CONFIRM_PROD_DB_WRITE exactly to: $CONFIRM_TEXT"
  exit 1
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "ERROR: production migrations can only be applied from main (current: $branch)"
  exit 1
fi

if ! git diff --quiet; then
  echo "ERROR: unstaged tracked changes detected"
  exit 1
fi
if ! git diff --cached --quiet; then
  echo "ERROR: staged tracked changes detected"
  exit 1
fi

git fetch origin main >/dev/null 2>&1 || true
head_sha="$(git rev-parse HEAD)"
origin_sha="$(git rev-parse origin/main)"
if [[ "$head_sha" != "$origin_sha" ]]; then
  echo "ERROR: HEAD != origin/main"
  echo "HEAD: $head_sha"
  echo "origin/main: $origin_sha"
  exit 1
fi

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
ledger_output="$(mktemp)"
combined_sql="$(mktemp)"
cleanup() { rm -f "$ledger_output" "$combined_sql"; }
trap cleanup EXIT

read_ledger_count() {
  (
    cd worker-airtrust
    npx wrangler d1 execute "$db_name" --env "$db_env" --remote --json \
      --command "SELECT COUNT(*) AS count FROM d1_migrations WHERE name = '$migration_name';" > "$ledger_output"
  )
  node - "$ledger_output" <<'NODE'
const fs = require('node:fs');
const parsed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const count = Number(parsed?.[0]?.results?.[0]?.count);
if (!Number.isInteger(count) || count < 0) throw new Error('LEDGER_COUNT_INVALID');
process.stdout.write(String(count));
NODE
}

ledger_count="$(read_ledger_count)"
if [[ "$ledger_count" == "1" ]]; then
  echo "MIGRATION_ALREADY_APPLIED=$migration_name"
  exit 0
fi
if [[ "$ledger_count" != "0" ]]; then
  echo "ERROR: ledger contém $ledger_count entradas para $migration_name; esperado 0 ou 1." >&2
  exit 1
fi

node --input-type=module - "$migration_file" "$migration_name" "$combined_sql" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { buildLedgerAppliedSql } from './worker-airtrust/scripts/lib/migration-remote-apply.mjs';
const [migrationPath, migrationName, outputPath] = process.argv.slice(2);
writeFileSync(outputPath, buildLedgerAppliedSql({
  migrationSql: readFileSync(migrationPath, 'utf8'), migrationName,
}), { encoding: 'utf8', mode: 0o600 });
NODE
test -s "$combined_sql"
command=(npx wrangler d1 execute "$db_name" --env "$db_env" --remote --file "$combined_sql")

echo "⚠️  PRODUCTION MIGRATION APPLY"
echo "Timestamp (UTC): $timestamp"
echo "Branch: $branch"
echo "HEAD: $head_sha"
echo "origin/main: $origin_sha"
echo "D1 database: $db_name"
echo "D1 env: $db_env"
echo "Migration file: $migration_file"
printf 'Command:'
printf ' %q' "${command[@]}"
printf '\n'
echo "Proceeding with production migration execution..."

"${command[@]}"
ledger_count="$(read_ledger_count)"
if [[ "$ledger_count" != "1" ]]; then
  echo "MIGRATION_APPLIED_LEDGER_FAILED=$migration_name (ledger_count=$ledger_count)" >&2
  exit 1
fi
echo "LEDGER_ENTRY_CONFIRMED=$migration_name"
