#!/usr/bin/env bash
# Wraps worker-airtrust/scripts/backfill-certificado-validacao-hash-staging-remote.mjs
# with the same D1 Time Travel recovery-point capture used by
# scripts/staging/apply-approved-migration-with-recovery-point.sh, so an
# --apply backfill run is never executed without a fresh, verified recovery
# point immediately before the write.
#
# Staging-only in this script: production is intentionally not wireable here
# (see .github/workflows/backfill-validacao-hash.yml for why the production
# path is "prepared, not executed").
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
BLOCKED_PRODUCTION_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"

apply=false
release_sha=""
confirm=""
empresa_id=""
batch_size=""

for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --release-sha=*) release_sha="${arg#*=}" ;;
    --confirm=*) confirm="${arg#*=}" ;;
    --empresa-id=*) empresa_id="${arg#*=}" ;;
    --batch-size=*) batch_size="${arg#*=}" ;;
    *) echo "ERROR: argumento desconhecido: $arg" >&2; exit 1 ;;
  esac
done

if [[ -z "$release_sha" ]]; then
  echo "ERROR: --release-sha=<sha40> obrigatório." >&2
  exit 1
fi

db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
if [[ "$db_name" != "$ALLOWED_DB_NAME" || "$db_id" != "$ALLOWED_DB_ID" || "$db_id" == "$BLOCKED_PRODUCTION_DB_ID" ]]; then
  echo "ERROR: alvo não corresponde ao D1 de staging permitido." >&2
  exit 1
fi

node_args=(worker-airtrust/scripts/backfill-certificado-validacao-hash-staging-remote.mjs \
  --release-sha="$release_sha")
[[ -n "$empresa_id" ]] && node_args+=(--empresa-id="$empresa_id")
[[ -n "$batch_size" ]] && node_args+=(--batch-size="$batch_size")

if ! $apply; then
  echo "DRY_RUN: nenhum ponto de recuperação necessário (nenhuma escrita será realizada)."
  exec node "${node_args[@]}"
fi

if [[ -z "$confirm" ]]; then
  echo "ERROR: --apply requer --confirm=CONFIRM_STAGING_BACKFILL_VALIDACAO_HASH." >&2
  exit 1
fi

recovery_output="$(mktemp -t airtrust-staging-backfill-recovery.XXXXXXXX)"
trap 'rm -f "$recovery_output"' EXIT

recovery_timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Capturando ponto de recuperação D1 Time Travel antes do backfill..."
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
if (!/bookmark/i.test(serialized)) {
  throw new Error('TIME_TRAVEL_BOOKMARK_NOT_CONFIRMED');
}
NODE
echo "RECOVERY_TIMESTAMP_UTC=$recovery_timestamp"
echo "RECOVERY_POINT_CAPTURED=true"

node_args+=(--apply --confirm="$confirm" --recovery-point-confirmed)
exec node "${node_args[@]}"
