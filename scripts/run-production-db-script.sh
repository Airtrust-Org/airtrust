#!/usr/bin/env bash
set -euo pipefail

CONFIRM_TEXT="I understand this may modify production data"

if [[ $# -ne 1 ]]; then
  echo "ERROR: usage: bash scripts/run-production-db-script.sh <sql-file>"
  exit 1
fi

sql_file="$1"
if [[ -z "$sql_file" ]]; then
  echo "ERROR: SQL file path cannot be empty"
  exit 1
fi

db_env="${AIRTRUST_D1_ENV:-production}"
db_name="${AIRTRUST_D1_DATABASE:-airtrust-db}"

case "$sql_file" in
  sql/maintenance/2026-04-01-qualificacoes-legacy-codigo-safe-merge.sql|\
  sql/maintenance/2026-04-01-qualificacoes-legacy-codigo-residual-audit.sql|\
  sql/maintenance/2026-04-01-fap14-sk76-reclass.sql)
    ;;
  *)
    echo "ERROR: SQL file is not in the production allowlist: $sql_file"
    exit 1
    ;;
esac

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

if [[ ! -f "$sql_file" ]]; then
  echo "ERROR: SQL file not found: $sql_file"
  exit 1
fi

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "ERROR: production DB scripts can only run from main (current: $branch)"
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
command=(npx wrangler d1 execute "$db_name" --env "$db_env" --remote --file "$sql_file")

echo "⚠️  PRODUCTION DATABASE WRITE"
echo "Timestamp (UTC): $timestamp"
echo "Branch: $branch"
echo "HEAD: $head_sha"
echo "origin/main: $origin_sha"
echo "D1 database: $db_name"
echo "D1 env: $db_env"
echo "SQL file: $sql_file"
printf 'Command:'
printf ' %q' "${command[@]}"
printf '\n'
echo ""
echo "Proceeding with production SQL execution..."

"${command[@]}"
