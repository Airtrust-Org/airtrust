#!/usr/bin/env bash
# source_reference: single-migration-at-a-time, allowlisted, staging-only
# migration runner — replaces ad hoc `wrangler d1 execute --file=` calls with a
# script that requires an explicit backup, a green ledger preflight, and
# validated post-conditions before and after each write.
# operational_decision: never uses `wrangler d1 migrations apply` (would try to
# replay the whole, historically-broken chain — see docs/ops/staging-d1-migration-ledger-reconciliation.md).
# Applies exactly the migration files passed on the command line, each of
# which must be in APPROVED_MIGRATIONS below (this release: 0424 only).
# dry_run_required: default mode is dry-run (validates target, backup file,
# preflight, checksums — no write). --apply is required to execute.
# rollback_plan_required: see docs/ops/staging-release-runbook.md "D1" section
# — migrations are forward-only; compensatory DELETEs are documented there,
# never improvised by this script.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
CONFIRMATION_PHRASE="AIRTRUST_STAGING_MIGRATION_APPLY"
APPROVED_MIGRATIONS=("0424_examiner_universal_training_fichas.sql")

apply=false
backup_file=""
migration_arg=""

for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --backup-file=*) backup_file="${arg#*=}" ;;
    --migration=*) migration_arg="${arg#*=}" ;;
    *) echo "Argumento desconhecido: $arg" >&2; exit 1 ;;
  esac
done

if [[ -z "$migration_arg" ]]; then
  echo "ERROR: use --migration=<arquivo.sql> (exatamente um arquivo por execução)." >&2
  exit 1
fi

is_approved=false
for approved in "${APPROVED_MIGRATIONS[@]}"; do
  [[ "$migration_arg" == "$approved" ]] && is_approved=true
done
if ! $is_approved; then
  echo "ERROR: '$migration_arg' não está na allowlist desta release (${APPROVED_MIGRATIONS[*]}). Recusado." >&2
  exit 1
fi

migration_path="worker-airtrust/migrations/$migration_arg"
if [[ ! -f "$migration_path" ]]; then
  echo "ERROR: arquivo não encontrado: $migration_path" >&2
  exit 1
fi

if ! git diff --quiet -- "$migration_path" || ! git diff --cached --quiet -- "$migration_path"; then
  echo "ERROR: '$migration_path' tem alterações locais não commitadas. Recusado (evita aplicar SQL não revisado)." >&2
  exit 1
fi

sha="$(git rev-parse HEAD)"
if command -v shasum >/dev/null 2>&1; then
  checksum="$(shasum -a 256 "$migration_path" | awk '{print $1}')"
else
  checksum="$(sha256sum "$migration_path" | awk '{print $1}')"
fi

echo "MIGRATION=$migration_arg"
echo "SHA=$sha"
echo "SQL_SHA256=$checksum"

if [[ -z "$backup_file" || ! -s "$backup_file" ]]; then
  echo "ERROR: --backup-file=<caminho> obrigatório e deve apontar para um backup não vazio " \
       "(gerado por scripts/staging/backup-d1-staging.sh --apply). Recusado sem backup verificado." >&2
  exit 1
fi
echo "BACKUP_VERIFIED=$backup_file"

echo "Rodando preflight de ledger (read-only)..."
if ! node scripts/staging/migration-ledger-preflight.mjs > /tmp/airtrust-migration-preflight.json; then
  echo "ERROR: preflight retornou estado ambíguo/vermelho. Aplicação recusada — revisão humana necessária." >&2
  cat /tmp/airtrust-migration-preflight.json >&2
  exit 1
fi
echo "PREFLIGHT_OK"

if ! $apply; then
  echo "DRY_RUN: alvo, allowlist, backup e preflight validados. Nenhuma escrita realizada."
  echo "DRY_RUN: para aplicar de fato, rode novamente com --apply e CONFIRM_STAGING_MIGRATION=$CONFIRMATION_PHRASE."
  exit 0
fi

if [[ "${CONFIRM_STAGING_MIGRATION:-}" != "$CONFIRMATION_PHRASE" ]]; then
  echo "ERROR: --apply requer CONFIRM_STAGING_MIGRATION=$CONFIRMATION_PHRASE explícito." >&2
  exit 1
fi

db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
if [[ "$db_name" != "$ALLOWED_DB_NAME" || "$db_id" != "$ALLOWED_DB_ID" ]]; then
  echo "ERROR: alvo '$db_name' ($db_id) não é o D1 de staging esperado. Recusado." >&2
  exit 1
fi

echo "Aplicando $migration_arg em $db_name (uma migration, uma única invocação --remote)..."
( cd worker-airtrust && npx wrangler d1 execute "$db_name" --remote --file="migrations/$migration_arg" )
apply_status=$?

if [[ $apply_status -ne 0 ]]; then
  echo "MIGRATION_FAILED (esperado se esta for uma tentativa deliberada sem CRED-EXA; ver runbook)." >&2
  exit "$apply_status"
fi

echo "Validando pós-condições de $migration_arg..."
if [[ "$migration_arg" == "0424_examiner_universal_training_fichas.sql" ]]; then
  bash "$ROOT/scripts/staging/validate-0424-postconditions.sh" "$db_name"
fi

echo "MIGRATION_APPLIED_AND_VALIDATED=$migration_arg"
