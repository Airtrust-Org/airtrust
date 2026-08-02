#!/usr/bin/env bash
set -euo pipefail

# Reviewed procedure for applying a single worker-airtrust/migrations/*.sql file
# to production D1. Mirrors the gate design of scripts/run-production-db-script.sh
# (explicit env-var gates, confirmation text, clean main branch) and adds a
# hard block for any migration marked NO_GO_MIGRATION_PRODUCAO.
#
# There is no runtime bypass flag for the NO_GO block. Lifting it requires
# removing the marker from the SQL file itself in a reviewed PR — that PR IS
# the deliberate, auditable authorization. This is intentional: a bypass env
# var could be set casually; editing a migration file under review cannot.

CONFIRM_TEXT="I understand this may modify production data"

echo "⚠️  PRODUCTION MIGRATION APPLY PATH"
echo "   This script executes one worker-airtrust/migrations/*.sql file against production D1."
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

if [[ ! -f "$migration_file" ]]; then
  echo "ERROR: migration file not found: $migration_file" >&2
  exit 1
fi

# Migrations with known ledger or execution constraints must NEVER be applied
# through this raw `d1 execute --remote --file` path. Each case below points to
# the reviewed, ledger-aware path that must be prepared or used instead.
case "$(basename "$migration_file")" in
  0438_controle_voos_rdv_coordenacao_workflow.sql)
    echo "ERROR: 0438 must not be applied via raw d1 execute." >&2
    echo "Production is missing this schema, and raw execution would reproduce the" >&2
    echo "schema/ledger drift already observed in staging because this path does not" >&2
    echo "record the reviewed change in the Schema V2 ledger." >&2
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
    echo "ERROR: $(basename "$migration_file") must be applied via the ledger-aware runner:" >&2
    echo "  bash scripts/production/apply-simuladores-matriz-remote-migration.sh $(basename "$migration_file")" >&2
    echo "That path uses 'wrangler d1 migrations apply', which updates d1_migrations." >&2
    exit 4
    ;;
  0443_simuladores_matriz_remediation_compensation.sql)
    echo "ERROR: 0443 must be applied via its dedicated ledger-aware runner:" >&2
    echo "  bash scripts/production/apply-simuladores-matriz-0443-remote-migration.sh 0443_simuladores_matriz_remediation_compensation.sql" >&2
    echo "'wrangler d1 migrations apply' fails on 0443 with SQLITE_ERROR: incomplete" >&2
    echo "input (confirmed root cause: it submits via D1's query API action, which" >&2
    echo "cannot reliably parse this migration's size/complexity; the import API" >&2
    echo "action used by that runner's --file submission handles it correctly and" >&2
    echo "atomically — see docs/ops/simuladores-matriz-legacy-equivalent-remediation-runbook.md)." >&2
    exit 4
    ;;
esac

no_go_check="$(node scripts/check-single-migration-no-go.mjs "$migration_file")"

if [[ "$no_go_check" == "BLOCKED" ]]; then
  echo "ERROR: $migration_file is marked NO_GO_MIGRATION_PRODUCAO." >&2
  echo "This migration cannot be applied to production through this script." >&2
  echo "See the NO_GO_MIGRATION_PRODUCAO comment inside the file for the reason and release conditions." >&2
  echo "There is no override flag. The marker must be removed via a reviewed PR before this can run." >&2
  exit 3
fi

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
command=(npx wrangler d1 execute "$db_name" --env "$db_env" --remote --file "$migration_file")

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
echo ""
echo "Proceeding with production migration execution..."

"${command[@]}"
