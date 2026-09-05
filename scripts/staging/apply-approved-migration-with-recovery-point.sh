#!/usr/bin/env bash
# Applies one allowlisted staging D1 migration only after capturing a D1 Time
# Travel recovery point. Full D1 exports are intentionally excluded from this
# routine path because exports can temporarily make the database unavailable.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
CONFIRMATION_PHRASE="AIRTRUST_STAGING_SCHEMA_CHANGE"
APPROVED_MIGRATIONS=(
  "0453_ead_category_reconciliation_executor.sql"
  "0454_qualificacoes_tipos_dominio_override.sql"
  "0461_refresh_tokens_empresa_id.sql"
  "0462_qualificacoes_tipos_codigo_tenant_active_unique.sql"
  "0466_cae_planning_v3.sql"
  "0467_sigvoos_shadow_parallel_v1.sql"
  "0468_sigvoos_shadow_leg_crew_v1.sql"
  "0469_lms_completion_pendencias_snapshots.sql"
  "0470_certificado_validacao_hash_index.sql"
  "0472_frms_operational_readiness.sql"
  "0475_usuarios_empresas_perfis_reconciliation.sql"
  "0476_frms_pvtb_v2_operational_load.sql"
)

apply=false
migration_arg=""

for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --migration=*) migration_arg="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg" >&2; exit 1 ;;
  esac
done

if [[ -z "$migration_arg" ]]; then
  echo "ERROR: use --migration=<arquivo.sql>." >&2
  exit 1
fi

migration_basename="$(basename "$migration_arg")"
is_approved=false
for approved in "${APPROVED_MIGRATIONS[@]}"; do
  [[ "$migration_basename" == "$approved" ]] && is_approved=true
done
if ! $is_approved; then
  echo "ERROR: migration fora da allowlist: $migration_basename" >&2
  exit 1
fi

# The outer release preflight has already limited its decision to the explicit
# release list. This per-migration recovery runner must not reintroduce a
# historical-ledger dependency while applying an individual approved file.
RELEASE_PREFLIGHT_SCOPE="${migration_basename%%_*}"

migration_path="$migration_arg"
expected_path="release/worker-airtrust/migrations/$migration_basename"
if [[ "$migration_path" != "$expected_path" ]]; then
  echo "ERROR: caminho inválido; esperado $expected_path" >&2
  exit 1
fi
if [[ -L "$migration_path" || ! -f "$migration_path" ]]; then
  echo "ERROR: migration ausente ou symlink recusado: $migration_path" >&2
  exit 1
fi
if ! git -C release diff --quiet -- "worker-airtrust/migrations/$migration_basename" || \
   ! git -C release diff --cached --quiet -- "worker-airtrust/migrations/$migration_basename"; then
  echo "ERROR: migration possui alteração local não commitada." >&2
  exit 1
fi

release_sha="$(git -C release rev-parse HEAD)"
if command -v shasum >/dev/null 2>&1; then
  sql_sha256="$(shasum -a 256 "$migration_path" | awk '{print $1}')"
else
  sql_sha256="$(sha256sum "$migration_path" | awk '{print $1}')"
fi

db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
if [[ "$db_name" != "$ALLOWED_DB_NAME" || "$db_id" != "$ALLOWED_DB_ID" ]]; then
  echo "ERROR: alvo não corresponde ao D1 de staging permitido." >&2
  exit 1
fi
if [[ "$db_id" == "$BLOCKED_PRODUCTION_DB_ID" ]]; then
  echo "ERROR: ID de produção recusado." >&2
  exit 1
fi

printf 'MIGRATION=%s\nRELEASE_SHA=%s\nSQL_SHA256=%s\nTARGET_DB=%s\n' \
  "$migration_basename" "$release_sha" "$sql_sha256" "$db_name"

preflight_output="$(mktemp -t airtrust-staging-preflight.XXXXXXXX)"
recovery_output="$(mktemp -t airtrust-staging-recovery.XXXXXXXX)"
ledger_output="$(mktemp -t airtrust-staging-ledger.XXXXXXXX)"
combined_sql="$(mktemp -t airtrust-staging-migration-ledger.XXXXXXXX.sql)"
trap 'rm -f "$preflight_output" "$recovery_output" "$ledger_output" "$combined_sql"' EXIT

validate_postconditions() {
  case "$migration_basename" in
    0453_ead_category_reconciliation_executor.sql)
      bash scripts/staging/validate-0453-postconditions.sh --target="$db_name"
      ;;
    0454_qualificacoes_tipos_dominio_override.sql)
      bash scripts/staging/validate-0454-postconditions.sh --target="$db_name"
      ;;
    0461_refresh_tokens_empresa_id.sql)
      bash scripts/staging/validate-0461-postconditions.sh --target="$db_name"
      ;;
    0462_qualificacoes_tipos_codigo_tenant_active_unique.sql)
      bash scripts/staging/validate-0462-postconditions.sh --target="$db_name"
      ;;
    0466_cae_planning_v3.sql)
      bash scripts/staging/validate-0466-postconditions.sh --target="$db_name"
      ;;
    0467_sigvoos_shadow_parallel_v1.sql)
      bash scripts/staging/validate-0467-postconditions.sh --target="$db_name"
      ;;
    0468_sigvoos_shadow_leg_crew_v1.sql)
      bash scripts/staging/validate-0468-postconditions.sh --target="$db_name"
      ;;
    0469_lms_completion_pendencias_snapshots.sql)
      bash scripts/staging/validate-0469-postconditions.sh --target="$db_name"
      ;;
    0470_certificado_validacao_hash_index.sql)
      bash scripts/staging/validate-0470-postconditions.sh --target="$db_name"
      ;;
    0472_frms_operational_readiness.sql)
      bash scripts/staging/validate-0472-postconditions.sh --target="$db_name"
      ;;
    0475_usuarios_empresas_perfis_reconciliation.sql)
      bash scripts/staging/validate-0475-postconditions.sh --target="$db_name"
      ;;
    0476_frms_pvtb_v2_operational_load.sql)
      bash scripts/staging/validate-0476-postconditions.sh --target="$db_name"
      ;;
  esac
}

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
let parsed;
try {
  parsed = JSON.parse(res.stdout);
} catch {
  const start = res.stdout.indexOf('[');
  const end = res.stdout.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      parsed = JSON.parse(res.stdout.slice(start, end + 1));
    } catch (e2) {
      process.stderr.write(`JSON parse failed: ${e2.message}\nraw stdout: ${res.stdout}\n`);
      process.exit(1);
    }
  } else {
    process.stderr.write(`No JSON array found in stdout:\n${res.stdout}\n`);
    process.exit(1);
  }
}
const results = Array.isArray(parsed) ? parsed[0]?.results : parsed?.results;
if (!Array.isArray(results) || results.length === 0) {
  process.stderr.write(`No results array found in output:\n${JSON.stringify(parsed, null, 2)}\nraw stdout:\n${res.stdout}\n`);
  process.exit(1);
}
const row = results[0];
const val = row?.count ?? row?.COUNT ?? row?.total ?? row?.TOTAL ?? row?.['COUNT(*)'] ?? row?.['count(*)'] ?? (row ? Object.values(row)[0] : NaN);
const count = Number(val);
if (!Number.isInteger(count) || count < 0) {
  process.stderr.write(`Invalid count value (${val}) extracted from row ${JSON.stringify(row)} in output:\n${JSON.stringify(parsed, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(String(count));
NODE
}

read_ledger_count() {
  query_count "SELECT COUNT(*) AS count FROM d1_migrations WHERE name = '$migration_basename';"
}

echo "Executando preflight de ledger somente leitura..."
if ! node scripts/staging/migration-ledger-preflight.mjs \
  --scope="$RELEASE_PREFLIGHT_SCOPE" > "$preflight_output"; then
  echo "ERROR: preflight de ledger recusou a alteração." >&2
  cat "$preflight_output" >&2
  exit 1
fi
echo "PREFLIGHT_OK=true"

if [[ "$migration_basename" == 0461_* || "$migration_basename" == 0462_* ]]; then
  node scripts/staging/preflight-0461-0462.mjs --migration="$migration_basename"
  echo "SPECIALIZED_PREFLIGHT_OK=true"
fi

ledger_count="$(read_ledger_count)"

  if [[ "$ledger_count" == "1" ]]; then
    validate_postconditions
    echo "MIGRATION_ALREADY_APPLIED_AND_VALIDATED=$migration_basename"
    echo "RECOVERY_TIMESTAMP_UTC=NOT_REQUIRED_ALREADY_APPLIED"
    echo "RECOVERY_POINT_CAPTURED=false"
    exit 0
  fi
  if [[ "$ledger_count" != "0" ]]; then
    echo "ERROR: ledger contém $ledger_count entradas para $migration_basename; esperado 0 ou 1." >&2
    exit 1
  fi

  node --input-type=module - "$migration_path" "$migration_basename" "$combined_sql" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { buildLedgerAppliedSql } from './worker-airtrust/scripts/lib/migration-remote-apply.mjs';

const [migrationPath, migrationName, outputPath] = process.argv.slice(2);
const migrationSql = readFileSync(migrationPath, 'utf8');
const combined = buildLedgerAppliedSql({ migrationSql, migrationName });
writeFileSync(outputPath, combined, { encoding: 'utf8', mode: 0o600 });
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
# The bookmark itself is deliberately never printed. The UTC timestamp is the
# operator-facing rollback reference and can deterministically retrieve it.
echo "RECOVERY_TIMESTAMP_UTC=$recovery_timestamp"
echo "RECOVERY_POINT_CAPTURED=true"

apply_status=0
(
  cd worker-airtrust
  npx wrangler d1 execute "$db_name" --remote --file="$combined_sql"
) || apply_status=$?
if [[ $apply_status -ne 0 ]]; then
  echo "MIGRATION_FAILED=$migration_basename" >&2
  exit "$apply_status"
fi

ledger_count="$(read_ledger_count)"
if [[ "$ledger_count" != "1" ]]; then
  echo "ERROR: migration executada sem entrada única no ledger ($ledger_count)." >&2
  exit 1
fi
echo "LEDGER_ENTRY_CONFIRMED=$migration_basename"

validate_postconditions

echo "MIGRATION_APPLIED_AND_VALIDATED=$migration_basename"
