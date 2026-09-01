#!/usr/bin/env bash
# source_reference: single-migration-at-a-time, allowlisted, staging-only
# migration runner — replaces ad hoc `wrangler d1 execute --file=` calls with a
# script that requires an explicit backup, a green ledger preflight, and
# validated post-conditions before and after each write.
# operational_decision: never uses the generic D1 migrations replay command
# (which would try to replay the whole, historically-broken chain — see
# docs/ops/staging-d1-migration-ledger-reconciliation.md).
# Applies exactly the migration files passed on the command line, each of
# which must be in APPROVED_MIGRATIONS below.
# dry_run_required: default mode is dry-run (validates target, backup file,
# preflight, checksums — no write). --apply is required to execute.
# rollback_plan_required: see docs/ops/staging-release-runbook.md "D1" section
# — migrations are forward-only; compensatory DELETEs are documented there,
# never improvised by this script.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PREFLIGHT_OUTPUT="$(mktemp -t airtrust-migration-preflight.XXXXXXXX)"
trap 'rm -f "$PREFLIGHT_OUTPUT"' EXIT

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
CONFIRMATION_PHRASE="AIRTRUST_STAGING_MIGRATION_APPLY"
APPROVED_MIGRATIONS=("0424_examiner_universal_training_fichas.sql" "0425_examiner_event_models_and_assignment_owned_fichas.sql" "0452_operational_domain_rbac.sql" "0453_ead_category_reconciliation_executor.sql" "0454_qualificacoes_tipos_dominio_override.sql" "0457_qualification_category_lms_contract.sql" "0459_sk76_periodic_code_denominator.sql" "0467_sigvoos_shadow_parallel_v1.sql" "0468_sigvoos_shadow_leg_crew_v1.sql" "0469_lms_completion_pendencias_snapshots.sql" "0470_certificado_validacao_hash_index.sql" "0472_frms_operational_readiness.sql" "0475_usuarios_empresas_perfis_reconciliation.sql" "0476_frms_pvtb_v2_operational_load.sql" "0477_edb_operational_core.sql" "0478_edb_anac_receipt_integrity.sql" "0479_edb_relational_integrity.sql" "0480_edb_diary_lifecycle_integrity.sql" "0481_training_dependency_planning.sql" "0482_training_dependency_complete_curriculum.sql")
# Compatibility marker for the previously validated release scope:
# RELEASE_PREFLIGHT_SCOPE="0421,0422,0423,0424,0425,0452,0453,0454"
RELEASE_PREFLIGHT_SCOPE="0421,0422,0423,0424,0425,0452,0453,0454,0457,0459,0467,0468,0469,0470,0472,0475,0476,0477,0478,0479,0480,0481,0482"

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

migration_basename="$(basename "$migration_arg")"

is_approved=false
for approved in "${APPROVED_MIGRATIONS[@]}"; do
  [[ "$migration_basename" == "$approved" ]] && is_approved=true
done
if ! $is_approved; then
  echo "ERROR: '$migration_basename' não está na allowlist desta release (${APPROVED_MIGRATIONS[*]}). Recusado." >&2
  exit 1
fi

migration_path="$migration_arg"

if [[ "$migration_path" != "release/worker-airtrust/migrations/$migration_basename" ]]; then
  echo "ERROR: Caminho inválido. O caminho da migration ($migration_path) deve ser estritamente release/worker-airtrust/migrations/$migration_basename. Path traversal ou escape detectado." >&2
  exit 1
fi

if [[ -L "$migration_path" ]]; then
  echo "ERROR: Symlinks não são permitidos para migrations: $migration_path" >&2
  exit 1
fi

if [[ ! -f "$migration_path" ]]; then
  echo "ERROR: arquivo não encontrado: $migration_path" >&2
  exit 1
fi

if ! git -C release diff --quiet -- "worker-airtrust/migrations/$migration_basename" || ! git -C release diff --cached --quiet -- "worker-airtrust/migrations/$migration_basename"; then
  echo "ERROR: '$migration_path' tem alterações locais não commitadas no checkout do release. Recusado." >&2
  exit 1
fi

sha="$(git -C release rev-parse HEAD)"
if command -v shasum >/dev/null 2>&1; then
  checksum="$(shasum -a 256 "$migration_path" | awk '{print $1}')"
else
  checksum="$(sha256sum "$migration_path" | awk '{print $1}')"
fi

echo "MIGRATION=$migration_basename"
echo "SHA=$sha"
echo "SQL_SHA256=$checksum"

if [[ -z "$backup_file" || ! -s "$backup_file" ]]; then
  echo "ERROR: --backup-file=<caminho> obrigatório e deve apontar para um backup não vazio " \
       "(gerado por scripts/staging/backup-d1-staging.sh --apply). Recusado sem backup verificado." >&2
  exit 1
fi
echo "BACKUP_VERIFIED=$backup_file"

# 0481 and 0482 were introduced through reviewed Schema V2 changes after the
# legacy staging path stopped at 0480. Each keeps a dedicated fail-closed
# staging runner with its own reviewed SQL identity and postconditions.
if [[ "$migration_basename" == "0481_training_dependency_planning.sql" ]]; then
  args=(--migration="$migration_path")
  $apply && args+=(--apply)
  exec bash "$ROOT/scripts/staging/apply-0481-training-dependency-planning.sh" "${args[@]}"
fi

if [[ "$migration_basename" == "0482_training_dependency_complete_curriculum.sql" ]]; then
  args=(--migration="$migration_path")
  $apply && args+=(--apply)
  exec bash "$ROOT/scripts/staging/apply-0482-training-dependency-complete-curriculum.sh" "${args[@]}"
fi

# Pending schema migrations 0467-0480 use the newer schema-change runner so
# DDL and d1_migrations ledger entry are applied atomically and a D1 Time
# Travel recovery point is captured. The official workflow still creates and
# verifies a full staging backup before invoking this script.
if [[ "$migration_basename" == "0467_sigvoos_shadow_parallel_v1.sql" || \
      "$migration_basename" == "0468_sigvoos_shadow_leg_crew_v1.sql" || \
      "$migration_basename" == "0469_lms_completion_pendencias_snapshots.sql" || \
      "$migration_basename" == "0470_certificado_validacao_hash_index.sql" || \
      "$migration_basename" == "0472_frms_operational_readiness.sql" || \
      "$migration_basename" == "0475_usuarios_empresas_perfis_reconciliation.sql" || \
      "$migration_basename" == "0476_frms_pvtb_v2_operational_load.sql" || \
      "$migration_basename" == "0477_edb_operational_core.sql" || \
      "$migration_basename" == "0478_edb_anac_receipt_integrity.sql" || \
      "$migration_basename" == "0479_edb_relational_integrity.sql" || \
      "$migration_basename" == "0480_edb_diary_lifecycle_integrity.sql" ]]; then
  args=(--migration="$migration_path")
  $apply && args+=(--apply)
  exec bash "$ROOT/scripts/staging/apply-approved-migration-with-recovery-point.sh" "${args[@]}"
fi

echo "Rodando preflight de ledger (read-only)..."
if ! node scripts/staging/migration-ledger-preflight.mjs --scope="$RELEASE_PREFLIGHT_SCOPE" > "$PREFLIGHT_OUTPUT"; then
  echo "ERROR: preflight retornou estado ambíguo/vermelho. Aplicação recusada — revisão humana necessária." >&2
  cat "$PREFLIGHT_OUTPUT" >&2
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

echo "Aplicando $migration_basename em $db_name (uma migration, uma única invocação --remote)..."
apply_status=0
( cd worker-airtrust && npx wrangler d1 execute "$db_name" --remote --file="../$migration_path" ) || apply_status=$?

if [[ $apply_status -ne 0 ]]; then
  echo "MIGRATION_FAILED (esperado se esta for uma tentativa deliberada sem CRED-EXA; ver runbook)." >&2
  exit "$apply_status"
fi

echo "Validando pós-condições de $migration_arg..."
if [[ "$migration_basename" == "0424_examiner_universal_training_fichas.sql" ]]; then
  bash "$ROOT/scripts/staging/validate-0424-postconditions.sh" --target="$db_name"
fi
if [[ "$migration_basename" == "0452_operational_domain_rbac.sql" ]]; then
  bash "$ROOT/scripts/staging/validate-0452-postconditions.sh" --target="$db_name"
fi
if [[ "$migration_basename" == "0453_ead_category_reconciliation_executor.sql" ]]; then
  bash "$ROOT/scripts/staging/validate-0453-postconditions.sh" --target="$db_name"
fi
if [[ "$migration_basename" == "0454_qualificacoes_tipos_dominio_override.sql" ]]; then
  bash "$ROOT/scripts/staging/validate-0454-postconditions.sh" --target="$db_name"
fi
if [[ "$migration_basename" == "0457_qualification_category_lms_contract.sql" ]]; then
  bash "$ROOT/scripts/staging/validate-0457-postconditions.sh" --target="$db_name"
fi
if [[ "$migration_basename" == "0459_sk76_periodic_code_denominator.sql" ]]; then
  bash "$ROOT/scripts/staging/validate-0459-postconditions.sh" --target="$db_name"
fi

echo "MIGRATION_APPLIED_AND_VALIDATED=$migration_basename"
