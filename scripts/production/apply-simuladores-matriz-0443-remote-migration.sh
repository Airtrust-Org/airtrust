#!/usr/bin/env bash
set -euo pipefail

# Reviewed REMOTE runner for migration 0443 ONLY, via D1's file-import API
# action instead of `wrangler d1 migrations apply`.
#
# Root cause this works around: `wrangler d1 migrations apply` builds the
# combined "migration content + ledger INSERT" text internally and submits
# it via D1's `query` API action — the same lightweight path used by
# `d1 execute --command`. That path was empirically found to fail with
# `SQLITE_ERROR: incomplete input` on large/trigger-heavy migrations (0440
# and 0443 both reproduce it on a disposable D1; see
# docs/ops/simuladores-matriz-legacy-equivalent-remediation-runbook.md).
# The exact same combined text submitted via D1's `import` API action
# (`wrangler d1 execute --remote --file <path>`, which uploads the file for
# server-side processing) succeeds every time, and — per wrangler's own
# CLI output and an explicit forced-failure test on a disposable D1 — that
# path is atomic: a mid-file error leaves zero partial state.
#
# This script therefore builds the same "migration + ledger INSERT" unit
# `migrations apply` would build, writes it to an isolated temp file, and
# submits it via `d1 execute --remote --file`, so the ledger insert is part
# of the same atomic unit as the schema change — never a separate manual
# step.
#
# This script:
#   - accepts EXCLUSIVELY 0443_simuladores_matriz_remediation_compensation.sql;
#   - locks the target to the production D1 (name + id) read from wrangler.toml;
#   - requires clean main == origin/main;
#   - requires an official backup (outside git) validated by byte size + SHA-256;
#   - requires the same explicit gates as scripts/apply-migration-production.sh
#     (AIRTRUST_ALLOW_PROD_DB_WRITE=YES + confirmation text);
#   - verifies the ledger afterwards. Re-execution is idempotent: if the
#     migration is already ledgered, this script refuses to resubmit rather
#     than risk a duplicate/partial re-run.

CONFIRM_TEXT="I understand this may modify production data"
EXPECTED_DB_NAME="airtrust-db"
EXPECTED_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
ALLOWED_0443="0443_simuladores_matriz_remediation_compensation.sql"

echo "⚠️  PRODUCTION REMOTE MIGRATION RUNNER (0443 only, file-import based)"

if [[ $# -ne 1 ]]; then
  echo "ERROR: usage: bash scripts/production/apply-simuladores-matriz-0443-remote-migration.sh $ALLOWED_0443" >&2
  exit 1
fi

migration_name="$1"

case "$migration_name" in
  "$ALLOWED_0443")
    ;;
  *)
    echo "ERROR: only $ALLOWED_0443 is permitted (got: $migration_name)" >&2
    exit 1
    ;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT/worker-airtrust/migrations"
CONFIG="$REPO_ROOT/worker-airtrust/wrangler.toml"
SRC="$SOURCE_DIR/$migration_name"

if [[ ! -f "$SRC" ]]; then
  echo "ERROR: authorized migration not found: $SRC" >&2
  exit 1
fi

# ---- Gate: production target lock (from real config) ----
prod_block="$(awk '/^\[\[env\.production\.d1_databases\]\]/{f=1} f{print} f&&/^$/{exit}' "$CONFIG")"
cfg_name="$(printf '%s\n' "$prod_block" | sed -n 's/^database_name *= *"\([^"]*\)".*/\1/p' | head -1)"
cfg_id="$(printf '%s\n' "$prod_block" | sed -n 's/^database_id *= *"\([^"]*\)".*/\1/p' | head -1)"
if [[ "$cfg_name" != "$EXPECTED_DB_NAME" || "$cfg_id" != "$EXPECTED_DB_ID" ]]; then
  echo "ERROR: production D1 target mismatch." >&2
  echo "  config: $cfg_name / $cfg_id" >&2
  echo "  expected: $EXPECTED_DB_NAME / $EXPECTED_DB_ID" >&2
  exit 1
fi

# ---- Gate: explicit prod-write env gates ----
if [[ "${AIRTRUST_ALLOW_PROD_DB_WRITE:-}" != "YES" ]]; then
  echo "ERROR: set AIRTRUST_ALLOW_PROD_DB_WRITE=YES to continue" >&2
  exit 1
fi
if [[ "${AIRTRUST_CONFIRM_PROD_DB_WRITE:-}" != "$CONFIRM_TEXT" ]]; then
  echo "ERROR: set AIRTRUST_CONFIRM_PROD_DB_WRITE exactly to: $CONFIRM_TEXT" >&2
  exit 1
fi

# ---- Gate: clean main == origin/main ----
branch="$(git -C "$REPO_ROOT" branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "ERROR: production migrations can only be applied from main (current: $branch)" >&2
  exit 1
fi
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
  echo "ERROR: working tree not clean" >&2
  exit 1
fi
git -C "$REPO_ROOT" fetch origin main >/dev/null 2>&1 || true
head_sha="$(git -C "$REPO_ROOT" rev-parse HEAD)"
origin_sha="$(git -C "$REPO_ROOT" rev-parse origin/main)"
if [[ "$head_sha" != "$origin_sha" ]]; then
  echo "ERROR: HEAD ($head_sha) != origin/main ($origin_sha)" >&2
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

# ---- Gate: refuse if already ledgered (idempotency, no duplicate/partial resubmit) ----
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ledger_check_file="$TMP_DIR/ledger_check.sql"
printf "SELECT name FROM d1_migrations WHERE name='%s';\n" "$migration_name" > "$ledger_check_file"
ledger_output="$(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env production --config "$CONFIG" --file "$ledger_check_file" --json)"
if printf '%s' "$ledger_output" | grep -q "\"name\":\"$migration_name\""; then
  echo "✅ $migration_name already ledgered in production. Nothing to do (idempotent no-op)." >&2
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
echo "⚠️  PRODUCTION REMOTE MIGRATION APPLY (file-import path)"
echo "Timestamp (UTC): $timestamp"
echo "Branch: $branch  HEAD: $head_sha"
echo "D1: $cfg_name / $cfg_id"
echo "Migration: $migration_name"
echo ""

echo "== Applying via file-import (atomic; failure leaves zero partial state) =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env production --config "$CONFIG" --file "$COMBINED_FILE")

echo "== Ledger after apply =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env production --config "$CONFIG" --command "SELECT id, name, applied_at FROM d1_migrations WHERE name='$migration_name'")
