#!/usr/bin/env bash
# source_reference: official, versioned staging D1 backup — replaces the ad hoc
# `wrangler d1 export` runs previously done by hand (see
# docs/ops/staging-examiner-training-release-20260710.md "Backup" section).
# operational_decision: fail-safe by construction — refuses any database ID/name
# that isn't the exact staging D1, requires an explicit confirmation phrase,
# fails loudly on an empty export or unusable checksum, and never prints
# personal data or tokens (the export itself may contain synthetic-only or
# pre-existing staging data; this script does not filter payload content —
# operators must not restore this backup into a database with real PII).
# dry_run_required: run without --apply first; --apply is required to write the backup file.
# rollback_plan_required: this script only reads (`d1 export`); it has no
# destructive path. Restoring FROM a backup is a separate, explicitly
# authorized operation, not performed by this script.
set -euo pipefail

ALLOWED_DB_NAME="airtrust-db-staging-baseline-20260701"
ALLOWED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
CONFIRMATION_PHRASE="AIRTRUST_STAGING_BACKUP"

BLOCKED_DB_NAMES=("airtrust-db" "airtrust-db-dev" "airtrust-db-production")
BLOCKED_DB_IDS=("7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae" "a72fb05b-0912-4ad9-9686-e7948c8b09eb")

apply=false
db_name="${STAGING_D1_NAME:-$ALLOWED_DB_NAME}"
db_id="${STAGING_D1_ID:-$ALLOWED_DB_ID}"
out_dir="${STAGING_BACKUP_DIR:-/tmp/airtrust-staging-backups}"

for arg in "$@"; do
  case "$arg" in
    --apply) apply=true ;;
    --out-dir=*) out_dir="${arg#*=}" ;;
    *) echo "Argumento desconhecido: $arg" >&2; exit 1 ;;
  esac
done

for blocked in "${BLOCKED_DB_NAMES[@]}"; do
  if [[ "$db_name" == "$blocked" ]]; then
    echo "ERROR: database '$db_name' está na allowlist de bloqueio (produção/dev). Abortando." >&2
    exit 1
  fi
done
for blocked in "${BLOCKED_DB_IDS[@]}"; do
  if [[ "$db_id" == "$blocked" ]]; then
    echo "ERROR: database ID '$db_id' está na allowlist de bloqueio (produção/dev). Abortando." >&2
    exit 1
  fi
done
if [[ "$db_name" != "$ALLOWED_DB_NAME" || "$db_id" != "$ALLOWED_DB_ID" ]]; then
  echo "ERROR: alvo '$db_name' ($db_id) não é o D1 de staging esperado ($ALLOWED_DB_NAME / $ALLOWED_DB_ID)." >&2
  exit 1
fi

if [[ "${ENVIRONMENT:-staging}" != "staging" ]]; then
  echo "ERROR: ENVIRONMENT deve ser 'staging'. Recebido: '${ENVIRONMENT:-}'." >&2
  exit 1
fi

if ! $apply; then
  echo "DRY-RUN: alvo validado ($db_name / $db_id), nenhum backup foi executado."
  echo "DRY-RUN: para executar de fato, rode novamente com --apply e CONFIRM_STAGING_BACKUP=$CONFIRMATION_PHRASE."
  exit 0
fi

if [[ "${CONFIRM_STAGING_BACKUP:-}" != "$CONFIRMATION_PHRASE" ]]; then
  echo "ERROR: --apply requer CONFIRM_STAGING_BACKUP=$CONFIRMATION_PHRASE explícito no ambiente." >&2
  exit 1
fi

# Restrict permissions on everything this script creates from here on — the
# dump may contain synthetic-only or pre-existing staging data (see header).
umask 077

mkdir -p "$out_dir"
timestamp_utc="$(date -u +"%Y%m%dT%H%M%SZ")"
# Second-resolution timestamps are guessable; add a random suffix so the
# output path can't be pre-created as a symlink by another local process
# before wrangler writes to it (the file itself doesn't exist until wrangler
# creates it, so this only narrows the race window, matching the guarantee
# `mktemp`-style naming provides without requiring the file to be
# pre-created empty).
random_suffix="$(od -An -N4 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n' || echo "$$")"
out_file="$out_dir/staging-backup-${timestamp_utc}-${random_suffix}.sql"
checksum_file="${out_file}.sha256"

echo "Exportando $db_name (remote) para $out_file ..."
# Pass the absolute output path through unchanged. Prefixing it with ../ while
# running Wrangler from worker-airtrust turns /tmp/... into ..//tmp/... and
# makes Wrangler fail after successfully creating the remote D1 export.
( cd worker-airtrust && npx wrangler d1 export "$db_name" --remote --output "$out_file" )

if [[ ! -s "$out_file" ]]; then
  echo "ERROR: backup vazio ou não gerado ($out_file). Abortando — não confiar neste backup." >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$out_file" | awk '{print $1}' > "$checksum_file"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$out_file" | awk '{print $1}' > "$checksum_file"
else
  echo "ERROR: nenhuma ferramenta sha256 disponível (shasum/sha256sum). Abortando — checksum obrigatório." >&2
  exit 1
fi

if [[ ! -s "$checksum_file" ]]; then
  echo "ERROR: checksum não pôde ser calculado ($checksum_file vazio). Abortando." >&2
  exit 1
fi

file_size="$(wc -c < "$out_file" | tr -d ' ')"
line_count="$(wc -l < "$out_file" | tr -d ' ')"
checksum="$(cat "$checksum_file")"

echo "BACKUP_OK"
echo "  database: $db_name ($db_id)"
echo "  timestamp_utc: $timestamp_utc"
echo "  file: $out_file (fora do Git — $out_dir não é versionado)"
echo "  size_bytes: $file_size"
echo "  lines: $line_count"
echo "  sha256: $checksum"
echo "NOTE: este script não imprime nem inspeciona linhas do dump (evita vazar dados pessoais/tokens no log)."
