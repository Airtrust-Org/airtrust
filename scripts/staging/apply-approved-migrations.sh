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
APPROVED_MIGRATIONS=("0424_examiner_universal_training_fichas.sql" "0425_examiner_event_models_and_assignment_owned_fichas.sql" "0452_operational_domain_rbac.sql" "0453_ead_category_reconciliation_executor.sql" "0454_qualificacoes_tipos_dominio_override.sql" "0457_qualification_category_lms_contract.sql" "0459_sk76_periodic_code_denominator.sql" "0467_sigvoos_shadow_parallel_v1.sql" "0468_sigvoos_shadow_leg_crew_v1.sql" "0469_lms_completion_pendencias_snapshots.sql" "0470_certificado_validacao_hash_index.sql" "0472_frms_operational_readiness.sql" "0475_usuarios_empresas_perfis_reconciliation.sql" "0476_frms_pvtb_v2_operational_load.sql" "0481_training_dependency_planning.sql" "0482_training_dependency_complete_curriculum.sql")
# Compatibility marker for the previously validated release scope:
# RELEASE_PREFLIGHT_SCOPE="0421,0422,0423,0424,0425,0452,0453,0454"
RELEASE_PREFLIGHT_SCOPE="0421,0422,0423,0424,0425,0452,0453,0454,0457,0459,0467,0468,0469,0470,0472,0475,0476,0481,0482"

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

# HEALTH P0-08 / #477: this dispatcher used to fall through, for every
# migration below, to a bare `wrangler d1 execute --file=` call guarded only
# by a preflight and an ad hoc per-migration postcondition check — with no
# ledger/recovery-point atomicity and no idempotent already-applied check.
# That hybrid/legacy path has been removed. Every allowlisted migration is
# now routed to a dedicated or governed runner before this script can reach
# a raw `wrangler d1 execute` call; see the "no unrouted allowlist entry"
# test below for the guarantee. RELEASE_PREFLIGHT_SCOPE above documents the
# full historical release scope for audit trail — each governed runner
# performs its own narrower single-migration ledger preflight
# (scripts/staging/migration-ledger-preflight.mjs --scope=<prefix>) instead.

# 0481-0482 have dedicated staging runners because the reviewed changes are
# Schema V2 bundles. Staging must execute the exact SQL pinned by the same
# manifest used in production and keep its own D1 ledger/recovery point.
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

# Every remaining allowlisted migration — including the pre-Schema-V2
# examiner/RBAC/qualification-category/SK-76 migrations that used to fall
# through to the bare `wrangler d1 execute --file=` path — goes through the
# same ledger-aware, idempotent, recovery-point runner as the reviewed
# 0467-0476 schema migrations: it checks d1_migrations for this exact
# migration name first (an already-applied rerun is a read-only no-op, never
# a second write), and only captures a D1 Time Travel recovery point and
# applies migration+ledger atomically when the ledger has zero entries for
# it. Its own validate_postconditions() invokes
# validate-0424-postconditions.sh, validate-0452-postconditions.sh,
# validate-0453-postconditions.sh, validate-0454-postconditions.sh,
# validate-0457-postconditions.sh and validate-0459-postconditions.sh for
# these migrations (0425 has no dedicated structural postcondition
# validator). Historical eDB placeholders 0477-0480 were never landed on
# current main and are intentionally not allowlisted.
if [[ "$migration_basename" == "0424_examiner_universal_training_fichas.sql" || \
      "$migration_basename" == "0425_examiner_event_models_and_assignment_owned_fichas.sql" || \
      "$migration_basename" == "0452_operational_domain_rbac.sql" || \
      "$migration_basename" == "0453_ead_category_reconciliation_executor.sql" || \
      "$migration_basename" == "0454_qualificacoes_tipos_dominio_override.sql" || \
      "$migration_basename" == "0457_qualification_category_lms_contract.sql" || \
      "$migration_basename" == "0459_sk76_periodic_code_denominator.sql" || \
      "$migration_basename" == "0467_sigvoos_shadow_parallel_v1.sql" || \
      "$migration_basename" == "0468_sigvoos_shadow_leg_crew_v1.sql" || \
      "$migration_basename" == "0469_lms_completion_pendencias_snapshots.sql" || \
      "$migration_basename" == "0470_certificado_validacao_hash_index.sql" || \
      "$migration_basename" == "0472_frms_operational_readiness.sql" || \
      "$migration_basename" == "0475_usuarios_empresas_perfis_reconciliation.sql" || \
      "$migration_basename" == "0476_frms_pvtb_v2_operational_load.sql" ]]; then
  args=(--migration="$migration_path")
  $apply && args+=(--apply)
  exec bash "$ROOT/scripts/staging/apply-approved-migration-with-recovery-point.sh" "${args[@]}"
fi

# Every name declared in APPROVED_MIGRATIONS above must be handled by one of
# the branches above. Reaching this point means the allowlist and the
# dispatch table have drifted apart — fail closed instead of ever falling
# through to an unrouted, non-ledger-aware apply.
echo "ERROR: '$migration_basename' está na allowlist mas não tem runner de destino roteado (drift allowlist/dispatch). Recusado." >&2
exit 1
