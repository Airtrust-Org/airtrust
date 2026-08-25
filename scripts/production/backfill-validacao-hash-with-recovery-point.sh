#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOWED_DB_NAME="airtrust-db"
ALLOWED_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
BLOCKED_STAGING_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"

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

[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || { echo "ERROR: --release-sha=<sha40> obrigatório." >&2; exit 1; }

db_name="${PRODUCTION_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${PRODUCTION_D1_ID:-$ALLOWED_DB_ID}"
if [[ "$db_name" != "$ALLOWED_DB_NAME" || "$db_id" != "$ALLOWED_DB_ID" || "$db_id" == "$BLOCKED_STAGING_DB_ID" ]]; then
  echo "ERROR: alvo não corresponde ao D1 de produção permitido." >&2
  exit 1
fi

node_args=(worker-airtrust/scripts/backfill-certificado-validacao-hash-production-remote.mjs --release-sha="$release_sha")
[[ -n "$empresa_id" ]] && node_args+=(--empresa-id="$empresa_id")
[[ -n "$batch_size" ]] && node_args+=(--batch-size="$batch_size")

if ! $apply; then
  echo "DRY_RUN_PRODUCTION: nenhuma escrita será realizada."
  exec node "${node_args[@]}"
fi

[[ "$confirm" == "CONFIRM_PRODUCTION_BACKFILL_VALIDACAO_HASH" ]] || {
  echo "ERROR: confirmação exata de produção ausente." >&2
  exit 1
}

recovery_output="$(mktemp -t airtrust-production-backfill-recovery.XXXXXXXX)"
trap 'rm -f "$recovery_output"' EXIT
recovery_timestamp="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
echo "Capturando ponto de recuperação D1 Time Travel de produção antes do backfill..."
(
  cd worker-airtrust
  npx wrangler d1 time-travel info "$db_name" --env production --timestamp="$recovery_timestamp" --json > "$recovery_output"
)
test -s "$recovery_output"
node - "$recovery_output" <<'NODE'
const fs = require('node:fs');
const parsed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!/bookmark/i.test(JSON.stringify(parsed))) throw new Error('TIME_TRAVEL_BOOKMARK_NOT_CONFIRMED');
NODE
echo "RECOVERY_TIMESTAMP_UTC=$recovery_timestamp"
echo "RECOVERY_POINT_CAPTURED=true"

node_args+=(--apply --confirm="$confirm" --recovery-point-confirmed)
exec node "${node_args[@]}"
