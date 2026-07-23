#!/usr/bin/env bash
set -euo pipefail

# Reviewed REMOTE runner for the simuladores matrix follow-up migrations
# 0441 and 0442 ONLY, using Wrangler's own ledger mechanism
# (`wrangler d1 migrations apply --remote`) so d1_migrations is updated
# correctly — closing the structural gap that let 0440 be applied via raw
# `d1 execute --remote --file` without a ledger entry.
#
# This script:
#   - accepts EXCLUSIVELY 0441_simuladores_matriz_manobra_resolution.sql or
#     0442_simuladores_matriz_guia_relink.sql;
#   - hard-blocks 0440 (already physically applied — reconcile its ledger entry
#     with scripts/production/reconcile-simuladores-0440-ledger.mjs instead) and
#     every other filename;
#   - locks the target to the production D1 (name + id) read from wrangler.toml;
#   - requires clean main == origin/main;
#   - requires an official backup (outside git) validated by byte size + SHA-256;
#   - requires the same explicit gates as scripts/apply-migration-production.sh
#     (AIRTRUST_ALLOW_PROD_DB_WRITE=YES + confirmation text);
#   - copies ONLY the single authorized file, byte-identical, into an isolated
#     temp migrations dir (never points migrations_dir at the 400+ historical
#     migrations), and lets wrangler register it in the ledger;
#   - verifies the ledger afterwards. Re-execution is idempotent (wrangler skips
#     migrations already in the ledger).
#
# Usage:
#   AIRTRUST_ALLOW_PROD_DB_WRITE=YES \
#   AIRTRUST_CONFIRM_PROD_DB_WRITE="I understand this may modify production data" \
#   AIRTRUST_BACKUP_PATH=/abs/backup.sql \
#   AIRTRUST_BACKUP_BYTES=<bytes> \
#   AIRTRUST_BACKUP_SHA256=<hex> \
#   bash scripts/production/apply-simuladores-matriz-remote-migration.sh 0441_simuladores_matriz_manobra_resolution.sql

CONFIRM_TEXT="I understand this may modify production data"
EXPECTED_DB_NAME="airtrust-db"
EXPECTED_DB_ID="7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae"
ALLOWED_0441="0441_simuladores_matriz_manobra_resolution.sql"
ALLOWED_0442="0442_simuladores_matriz_guia_relink.sql"

echo "⚠️  PRODUCTION REMOTE MIGRATION RUNNER (0441/0442 only, ledger-aware)"

if [[ $# -ne 1 ]]; then
  echo "ERROR: usage: bash scripts/production/apply-simuladores-matriz-remote-migration.sh <0441_...sql|0442_...sql>" >&2
  exit 1
fi

migration_name="$1"

case "$migration_name" in
  0440_*)
    echo "ERROR: 0440 was already applied physically. Do NOT reapply it here." >&2
    echo "Reconcile its ledger entry with:" >&2
    echo "  node scripts/production/reconcile-simuladores-0440-ledger.mjs --apply ..." >&2
    exit 3
    ;;
  "$ALLOWED_0441"|"$ALLOWED_0442")
    ;;
  *)
    echo "ERROR: only $ALLOWED_0441 or $ALLOWED_0442 are permitted (got: $migration_name)" >&2
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

# ---- Isolated migrations dir with exactly one authorized file ----
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
TMP_MIGRATIONS_DIR="$TMP_DIR/migrations"
mkdir -p "$TMP_MIGRATIONS_DIR"
cp "$SRC" "$TMP_MIGRATIONS_DIR/$migration_name"
if ! cmp -s "$SRC" "$TMP_MIGRATIONS_DIR/$migration_name"; then
  echo "ERROR: copy of $migration_name is not byte-identical to source" >&2
  exit 1
fi
count="$(find "$TMP_MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')"
if [[ "$count" != "1" ]]; then
  echo "ERROR: isolated migrations dir must contain exactly 1 file; found $count" >&2
  exit 1
fi

# Generate an isolated wrangler config whose production d1 block points
# migrations_dir at the temp dir, leaving name/id untouched.
TMP_CONFIG="$TMP_DIR/wrangler.isolated.toml"
python3 - "$CONFIG" "$TMP_CONFIG" "$TMP_MIGRATIONS_DIR" <<'PY'
import sys, re
src, dst, migrations_dir = sys.argv[1:4]
with open(src) as f:
    content = f.read()
pattern = re.compile(
    r'(\[\[env\.production\.d1_databases\]\][^\[]*?migrations_dir\s*=\s*")[^"]*(")',
    re.DOTALL,
)
new_content, n = pattern.subn(r'\g<1>' + migrations_dir.replace('\\', '\\\\') + r'\g<2>', content)
if n != 1:
    raise SystemExit(f"ERROR: expected exactly one production migrations_dir rewrite, made {n}")
with open(dst, 'w') as f:
    f.write(new_content)
PY

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "⚠️  PRODUCTION REMOTE MIGRATION APPLY"
echo "Timestamp (UTC): $timestamp"
echo "Branch: $branch  HEAD: $head_sha"
echo "D1: $cfg_name / $cfg_id"
echo "Migration: $migration_name"
echo "Isolated migrations dir: $TMP_MIGRATIONS_DIR"
echo ""

echo "== Pending migrations (isolated view) =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 migrations list DB --remote --env production --config "$TMP_CONFIG")

echo "== Applying isolated migration via ledger =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 migrations apply DB --remote --env production --config "$TMP_CONFIG")

echo "== Ledger after apply =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute DB --remote --env production --config "$TMP_CONFIG" --command "SELECT id, name, applied_at FROM d1_migrations WHERE name IN ('$ALLOWED_0441','$ALLOWED_0442') ORDER BY id")
