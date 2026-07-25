#!/usr/bin/env bash
set -euo pipefail

# Reviewed REMOTE runner for the simuladores matrix migrations 0440-0443
# against STAGING, via D1's file-import API action instead of
# `wrangler d1 migrations apply`.
#
# Root cause this works around (same one already documented and fixed for
# production in scripts/production/apply-simuladores-matriz-0443-remote-migration.sh
# and worker-airtrust/scripts/lib/migration-remote-apply.mjs): `wrangler d1
# migrations apply --remote` submits the combined "migration + ledger INSERT"
# text via D1's `query` API action, which fails with `SQLITE_ERROR: incomplete
# input` on large/trigger-heavy migrations (reproduced here against real
# staging on 2026-07-25: it failed on the very first migration, 0440, with
# zero partial state — confirmed by reading back the ledger and schema
# immediately after). The same combined text submitted via the `import` API
# action (`d1 execute --remote --file`) succeeds atomically.
#
# This script:
#   - accepts ONLY 0440/0441/0442/0443_*.sql, one at a time;
#   - locks the target to the staging D1 (name + id) read from wrangler.toml;
#   - requires an official backup (outside git) validated by byte size + SHA-256;
#   - refuses to resubmit a migration already present in the staging ledger
#     (idempotent no-op);
#   - reuses the exact same combined-SQL builder already reviewed for
#     production (worker-airtrust/scripts/lib/migration-remote-apply.mjs).
#
# Usage:
#   AIRTRUST_BACKUP_PATH=/abs/staging_backup.sql \
#   AIRTRUST_BACKUP_BYTES=<bytes> \
#   AIRTRUST_BACKUP_SHA256=<hex> \
#   bash scripts/staging/apply-simuladores-matriz-remote-migration.sh 0440_simuladores_matriz_versionada_metadata.sql

EXPECTED_DB_NAME="airtrust-db-staging-baseline-20260701"
EXPECTED_DB_ID="bf9963f4-eb12-439b-a830-20bbf577ac22"
ALLOWED_RE='^(0440_simuladores_matriz_versionada_metadata|0441_simuladores_matriz_manobra_resolution|0442_simuladores_matriz_guia_relink|0443_simuladores_matriz_remediation_compensation)\.sql$'

echo "⚠️  STAGING REMOTE MIGRATION RUNNER (simuladores matriz 0440-0443, file-import based)"

if [[ $# -ne 1 ]]; then
  echo "ERROR: usage: bash scripts/staging/apply-simuladores-matriz-remote-migration.sh <0440..0443_*.sql>" >&2
  exit 1
fi

migration_name="$1"
if [[ ! "$migration_name" =~ $ALLOWED_RE ]]; then
  echo "ERROR: only the 4 simuladores matriz migrations (0440-0443) are permitted (got: $migration_name)" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT/worker-airtrust/migrations"
CONFIG="$REPO_ROOT/worker-airtrust/wrangler.toml"
SRC="$SOURCE_DIR/$migration_name"

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: authorized migration not found: $SRC" >&2
  exit 1
fi

# ---- Gate: staging target lock (from real config) ----
staging_block="$(awk '/^\[\[env\.staging\.d1_databases\]\]/{f=1} f{print} f&&/^$/{exit}' "$CONFIG")"
cfg_name="$(printf '%s\n' "$staging_block" | sed -n 's/^database_name *= *"\([^"]*\)".*/\1/p' | head -1)"
cfg_id="$(printf '%s\n' "$staging_block" | sed -n 's/^database_id *= *"\([^"]*\)".*/\1/p' | head -1)"
if [[ "$cfg_name" != "$EXPECTED_DB_NAME" || "$cfg_id" != "$EXPECTED_DB_ID" ]]; then
  echo "ERROR: staging D1 target mismatch." >&2
  echo "  config: $cfg_name / $cfg_id" >&2
  echo "  expected: $EXPECTED_DB_NAME / $EXPECTED_DB_ID" >&2
  exit 1
fi

# ---- Gate: official backup (outside git) validated by size + SHA-256 ----
backup_path="${AIRTRUST_BACKUP_PATH:-}"
backup_bytes="${AIRTRUST_BACKUP_BYTES:-}"
backup_sha="${AIRTRUST_BACKUP_SHA256:-}"
if [[ -z "$backup_path" || -z "$backup_bytes" || -z "$backup_sha" ]]; then
  echo "ERROR: AIRTRUST_BACKUP_PATH, AIRTRUST_BACKUP_BYTES and AIRTRUST_BACKUP_SHA256 are required" >&2
  exit 1
fi
if [[ ! -f "$backup_path" ]]; then
  echo "ERROR: backup not found: $backup_path" >&2
  exit 1
fi
actual_bytes="$(wc -c < "$backup_path" | tr -d ' ')"
if [[ "$actual_bytes" != "$backup_bytes" ]]; then
  echo "ERROR: backup size mismatch: $actual_bytes (expected $backup_bytes)" >&2
  exit 1
fi
actual_sha="$( (sha256sum "$backup_path" 2>/dev/null || shasum -a 256 "$backup_path") | awk '{print $1}')"
if [[ "$actual_sha" != "$backup_sha" ]]; then
  echo "ERROR: backup SHA-256 mismatch: $actual_sha (expected $backup_sha)" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# ---- Gate: refuse if already ledgered (idempotency, no duplicate/partial resubmit) ----
ledger_check_file="$TMP_DIR/ledger_check.sql"
printf "SELECT name FROM d1_migrations WHERE name='%s';\n" "$migration_name" > "$ledger_check_file"
ledger_output="$(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env staging --config "$CONFIG" --file "$ledger_check_file" --json)"
if printf '%s' "$ledger_output" | grep -q "\"name\":\"$migration_name\""; then
  echo "✅ $migration_name already ledgered in staging. Nothing to do (idempotent no-op)." >&2
  exit 0
fi

# ---- Build the atomic "migration + ledger INSERT" unit ----
COMBINED_FILE="$TMP_DIR/combined.sql"
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
import { buildLedgerAppliedSql } from '$REPO_ROOT/worker-airtrust/scripts/lib/migration-remote-apply.mjs';
const migrationSql = readFileSync('$SRC', 'utf8');
const combined = buildLedgerAppliedSql({ migrationSql, migrationName: '$migration_name' });
writeFileSync('$COMBINED_FILE', combined);
"

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "⚠️  STAGING REMOTE MIGRATION APPLY (file-import path)"
echo "Timestamp (UTC): $timestamp"
echo "D1: $cfg_name / $cfg_id"
echo "Migration: $migration_name"
echo ""

echo "== Applying via file-import (atomic; failure leaves zero partial state) =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env staging --config "$CONFIG" --file "$COMBINED_FILE")

echo "== Ledger after apply =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env staging --config "$CONFIG" --command "SELECT id, name, applied_at FROM d1_migrations WHERE name='$migration_name'")
