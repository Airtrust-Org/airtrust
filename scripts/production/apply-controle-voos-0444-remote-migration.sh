#!/usr/bin/env bash
set -euo pipefail

# Reviewed REMOTE runner for migration 0444 ONLY
# (0444_controle_voos_versao.sql — ALTER TABLE cv_voos ADD COLUMN versao
# INTEGER NOT NULL DEFAULT 1).
#
# Mirrors scripts/production/apply-simuladores-matriz-0443-remote-migration.sh:
# same gates (target lock, clean main==origin/main, explicit prod-write env
# vars, externally-supplied backup validated by size+SHA-256), same atomic
# "migration + ledger INSERT" transport (buildLedgerAppliedSql, submitted via
# `d1 execute --remote --file`, the import API action — not `d1 migrations
# apply`'s query action, which staging testing showed struggles on some
# migrations). 0444 is a single trivial ALTER TABLE with no triggers, so it
# would very likely also succeed via `d1 migrations apply` — this script uses
# the same atomic path anyway for consistency with the rest of this runner
# family and because it costs nothing extra.
#
# Adds explicit schema PREFLIGHT (refuses if cv_voos.versao already exists —
# production has never had this migration applied) and POSTFLIGHT (column
# shape, backfill, ledger, PRAGMA integrity_check, FK set unchanged) beyond
# what the 0443 runner does, per explicit requirement for this migration.
#
# This script:
#   - accepts EXCLUSIVELY 0444_controle_voos_versao.sql;
#   - locks the target to the production D1 (name + id) read from wrangler.toml;
#   - requires clean main == origin/main;
#   - requires an official backup (outside git) validated by byte size + SHA-256;
#   - requires the same explicit gates as scripts/apply-migration-production.sh
#     (AIRTRUST_ALLOW_PROD_DB_WRITE=YES + confirmation text);
#   - refuses (schema preflight) if cv_voos.versao already exists;
#   - applies migration + ledger insert atomically;
#   - verifies the ledger AND the schema AND integrity_check afterwards;
#   - is idempotent: if already ledgered, refuses to resubmit.
#
# Does NOT deploy the Worker. Deploying the Worker on the SHA that expects
# this column is a separate, later step (see docs referenced by the calling
# runbook) — schema first, code second, by design.
#
# source_reference: 0444_controle_voos_versao.sql is the only migration this
# runner accepts; the exact file bytes are read from
# worker-airtrust/migrations/ and hashed as part of buildLedgerAppliedSql.
# operational_decision: single ALTER TABLE ADD COLUMN, append-only, no
# destructive rewrite; ledger insert is part of the same atomic file-import
# unit as the schema change (never a separate manual step).
# dry_run_required: every gate above (target lock, clean main, backup
# validation, ledger idempotency, schema preflight) runs and can fail BEFORE
# the single write step below is ever reached.
# rollback_plan_required: see the block comment right before "Does NOT
# deploy the Worker" above and the runbook this script is invoked from —
# revert the Worker first, keep the column inert rather than DROP COLUMN
# unless removal is actually necessary.

CONFIRM_TEXT="I understand this may modify production data"
EXPECTED_DB_NAME="airtrust-db"
EXPECTED_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
ALLOWED_MIGRATION="0444_controle_voos_versao.sql"

echo "⚠️  PRODUCTION REMOTE MIGRATION RUNNER (0444 only, file-import based)"

if [[ $# -ne 1 ]]; then
  echo "ERROR: usage: bash scripts/production/apply-controle-voos-0444-remote-migration.sh $ALLOWED_MIGRATION" >&2
  exit 1
fi

migration_name="$1"

case "$migration_name" in
  "$ALLOWED_MIGRATION")
    ;;
  *)
    echo "ERROR: only $ALLOWED_MIGRATION is permitted (got: $migration_name)" >&2
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

# ---- Gate: production target lock (from real config, not a hardcoded guess) ----
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
# Produced separately, e.g.:
#   node scripts/production/backup-production-d1-readonly.mjs \
#     --out-file /path/outside/repo/airtrust-db-production-backup-<ts>.sql
# then export AIRTRUST_BACKUP_PATH/AIRTRUST_BACKUP_BYTES/AIRTRUST_BACKUP_SHA256
# from that command's JSON report before running this script.
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

# IMPORTANT (found empirically against real staging while preparing this
# runner, not documented by wrangler): two separate wrangler quirks matter
# for every check below:
#   1. `d1 execute --file ... --json` submits through D1's file-import API
#      action, which returns EXECUTION METADATA ("Total queries executed",
#      "Rows read", ...) in `results`, NOT the actual query rows — even for
#      a plain SELECT/PRAGMA. `--command` submits through the query API
#      action and returns real rows. Every read below (ledger check,
#      preflight, postflight, backfill, FK check) MUST use --command;
#      --file is reserved for the one actual migration DDL apply, where the
#      content is a write and metadata-vs-rows doesn't matter.
#   2. wrangler's `--json` output is PRETTY-PRINTED (`"name": "x"`, space
#      after the colon), not compact — a `grep -q '"name":"x"'` pattern
#      (no space) silently never matches. Every structured check below pipes
#      the JSON through `node -e` and uses JSON.parse (whitespace-agnostic)
#      instead of grepping the raw text for a compact-JSON shape.
json_field_equals() {
  # Usage: echo "$json" | json_field_equals <jq-like-path-as-JS> <expected-JSON-literal>
  # Kept intentionally tiny (no jq dependency) — reads stdin, JSON.parses,
  # evaluates the given JS expression against `rows` (results[0].results),
  # and exits 0 only if it returns exactly `true`.
  node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      let parsed;
      try { parsed = JSON.parse(d); } catch (e) { console.error('JSON parse failed: ' + e.message); process.exit(2); }
      const rows = parsed[0]?.results ?? [];
      const ok = (($1));
      process.exit(ok ? 0 : 1);
    });
  "
}

# ---- Gate: refuse if already ledgered (idempotency) ----
ledger_output="$(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env production --config "$CONFIG" --command "SELECT name FROM d1_migrations WHERE name='$migration_name';" --json)"
if printf '%s' "$ledger_output" | json_field_equals "rows.some(r => r.name === '$migration_name')"; then
  echo "✅ $migration_name already ledgered in production. Nothing to do (idempotent no-op)." >&2
  exit 0
fi

# ---- Schema PREFLIGHT: refuse if cv_voos.versao already exists ----
preflight_output="$(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env production --config "$CONFIG" --command "PRAGMA table_info(cv_voos);" --json)"
if printf '%s' "$preflight_output" | json_field_equals "rows.some(r => r.name === 'versao')"; then
  echo "ERROR: cv_voos.versao already exists in production, but 0444 is not ledgered." >&2
  echo "This is an inconsistent state — do not proceed. Investigate manually" >&2
  echo "(e.g. reconcile the ledger with a dedicated reconciler, mirroring" >&2
  echo "scripts/staging/reconcile-controle-voos-0444-ledger.mjs, instead of" >&2
  echo "re-running this migration)." >&2
  exit 5
fi
echo "== Preflight OK: cv_voos.versao does not exist yet in production =="

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
echo "Backup: $backup_path (bytes=$backup_bytes sha256=$backup_sha)"
echo ""

echo "== Applying via file-import (atomic; failure leaves zero partial state) =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env production --config "$CONFIG" --file "$COMBINED_FILE")

# ---- POSTFLIGHT: column shape, backfill, ledger, integrity, FK set ----
echo "== Postflight: schema =="
postflight_schema="$(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env production --config "$CONFIG" --command "PRAGMA table_info(cv_voos);" --json)"
if ! printf '%s' "$postflight_schema" | grep -q '"name":"versao"'; then
  echo "ERROR: postflight found no cv_voos.versao column after apply — investigate immediately." >&2
  exit 6
fi
echo "$postflight_schema" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const rows = JSON.parse(d)[0].results;
  const col = rows.find(r => r.name === 'versao');
  if (!col) { console.error('versao column missing'); process.exit(1); }
  if (String(col.type).toUpperCase() !== 'INTEGER') { console.error('unexpected type: ' + col.type); process.exit(1); }
  if (Number(col.notnull) !== 1) { console.error('not NOT NULL'); process.exit(1); }
  if (String(col.dflt_value) !== '1') { console.error('unexpected default: ' + col.dflt_value); process.exit(1); }
  console.error('OK: versao is INTEGER NOT NULL DEFAULT 1');
});
"

echo "== Postflight: backfill (no NULL/<1 versao rows) =="
backfill_output="$(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env production --config "$CONFIG" --command "SELECT COUNT(*) AS bad FROM cv_voos WHERE versao IS NULL OR versao < 1;" --json)"
if ! printf '%s' "$backfill_output" | json_field_equals "rows[0]?.bad === 0"; then
  echo "ERROR: postflight found rows with invalid versao. Output: $backfill_output" >&2
  exit 7
fi
echo "OK: no cv_voos rows with NULL/invalid versao"

echo "== Postflight: ledger =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env production --config "$CONFIG" --command "SELECT id, name, applied_at FROM d1_migrations WHERE name='$migration_name';")

echo "== Postflight: FK violations on cv_voos (must be zero) =="
# PRAGMA foreign_key_check works fine over D1's remote query API (confirmed
# empirically against staging); PRAGMA integrity_check does NOT (D1 returns
# "not authorized: SQLITE_AUTH" for it — confirmed empirically against both
# local and remote D1). That is why integrity_check below uses a full export
# + local sqlite3 inspection instead of a remote PRAGMA call.
fk_check_output="$(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env production --config "$CONFIG" --command "PRAGMA foreign_key_check(cv_voos);" --json)"
if ! printf '%s' "$fk_check_output" | json_field_equals "rows.length === 0"; then
  echo "ERROR: foreign_key_check found violations on cv_voos. Output: $fk_check_output" >&2
  exit 8
fi
echo "OK: zero FK violations on cv_voos"

echo "== Postflight: export + local sqlite3 integrity_check (also serves as backup POST) =="
POST_BACKUP_DIR="${AIRTRUST_POST_BACKUP_DIR:-/tmp/airtrust-production-backups}"
mkdir -p "$POST_BACKUP_DIR"
POST_BACKUP_FILE="$POST_BACKUP_DIR/airtrust-db-production-backup-post-0444-$(date -u +%Y%m%dT%H%M%SZ).sql"
node --input-type=module -e "
import { buildD1ExportArgs, inspectDumpWithSqlite, buildBackupReport } from '$REPO_ROOT/scripts/production/lib/backup-d1-readonly.mjs';
import { runCommand } from '$REPO_ROOT/scripts/production/lib/simuladores-matriz-preflight.mjs';
import { rmSync } from 'node:fs';

runCommand('npx', buildD1ExportArgs({
  database: 'airtrust-db',
  configPath: '$CONFIG',
  env: 'production',
  outputPath: '$POST_BACKUP_FILE',
}), { cwd: '$REPO_ROOT/worker-airtrust' });

const inspected = inspectDumpWithSqlite('$POST_BACKUP_FILE');
const report = buildBackupReport({
  outFile: '$POST_BACKUP_FILE',
  target: { database_name: 'airtrust-db', database_id: '$EXPECTED_DB_ID' },
  gitHead: '$head_sha',
  inspected,
});
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
rmSync(inspected.scratchDir, { recursive: true, force: true });
if (report.restored_sqlite.integrity_check !== 'ok') {
  console.error('ERROR: post-apply integrity_check did not return ok: ' + report.restored_sqlite.integrity_check);
  process.exit(9);
}
console.error('OK: post-apply integrity_check ok. Backup POST: $POST_BACKUP_FILE');
"

echo ""
echo "✅ Migration 0444 applied and verified in production."
echo "NEXT (separate, later step — do not do this now): deploy the Worker on"
echo "SHA $head_sha (the main HEAD this script just verified against), only"
echo "after this schema step is confirmed stable."
