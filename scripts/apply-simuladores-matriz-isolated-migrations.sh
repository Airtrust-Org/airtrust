#!/usr/bin/env bash
set -euo pipefail

# Applies ONLY worker-airtrust/migrations/0440_*, 0441_*, 0442_* — never the
# other 400+ historical pending/legacy migrations — using Wrangler's own
# ledger mechanism (`wrangler d1 migrations apply`), scoped to a temporary
# directory containing byte-identical copies of just those three files.
#
# Why a temp directory instead of pointing at worker-airtrust/migrations
# directly: `wrangler d1 migrations apply` always scans the entire configured
# migrations_dir and applies every file the ledger doesn't yet have an entry
# for, in filename order. This repo's migrations dir has historical debt
# (duplicate prefixes, non-standard filenames — see
# src/__tests__/migrations/migration-governance.test.ts) that must NOT be
# swept in by this run. Isolating to a directory that physically contains
# only the 3 authorized files is what makes "apply only 0440/0441/0442" true
# by construction, not by convention.
#
# Local-only. This script never touches production; it takes a D1 binding
# name + wrangler config that already resolve to a local/dev database. Remote
# application remains the reviewed procedure in
# scripts/apply-migration-production.sh (one file at a time, NO_GO-gated).
#
# Usage:
#   bash scripts/apply-simuladores-matriz-isolated-migrations.sh <wrangler-config> <d1-binding> [--local|--remote]
#
# Example (local):
#   bash scripts/apply-simuladores-matriz-isolated-migrations.sh \
#     worker-airtrust/wrangler.dev.toml DB --local

if [[ $# -lt 2 ]]; then
  echo "ERROR: usage: bash scripts/apply-simuladores-matriz-isolated-migrations.sh <wrangler-config> <d1-binding> [--local|--remote]" >&2
  exit 1
fi

WRANGLER_CONFIG="$1"
D1_BINDING="$2"
MODE="${3:---local}"

if [[ "$MODE" == "--remote" ]]; then
  echo "ERROR: this script only supports --local. Remote application requires the" >&2
  echo "reviewed, per-file, NO_GO-gated procedure in scripts/apply-migration-production.sh" >&2
  echo "with explicit AIRTRUST_ALLOW_PROD_DB_WRITE authorization for each file." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/worker-airtrust/migrations"
AUTHORIZED_FILES=(0440_simuladores_matriz_versionada_metadata.sql 0441_simuladores_matriz_manobra_resolution.sql 0442_simuladores_matriz_guia_relink.sql)

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
TMP_MIGRATIONS_DIR="$TMP_DIR/migrations"
mkdir -p "$TMP_MIGRATIONS_DIR"

echo "== Copying authorized migrations byte-identical =="
for name in "${AUTHORIZED_FILES[@]}"; do
  src="$SOURCE_DIR/$name"
  if [[ ! -f "$src" ]]; then
    echo "ERROR: authorized migration not found: $src" >&2
    exit 1
  fi
  cp "$src" "$TMP_MIGRATIONS_DIR/$name"
  if ! cmp -s "$src" "$TMP_MIGRATIONS_DIR/$name"; then
    echo "ERROR: copy of $name is not byte-identical to source" >&2
    exit 1
  fi
  sha256sum "$src" 2>/dev/null || shasum -a 256 "$src"
done

COUNT=$(ls -1 "$TMP_MIGRATIONS_DIR" | wc -l | tr -d ' ')
if [[ "$COUNT" != "3" ]]; then
  echo "ERROR: isolated migrations directory must contain exactly 3 files; found $COUNT" >&2
  exit 1
fi

echo "== Isolated migrations directory: $TMP_MIGRATIONS_DIR =="
ls -1 "$TMP_MIGRATIONS_DIR"

TMP_CONFIG="$TMP_DIR/wrangler.isolated.toml"
python3 - "$WRANGLER_CONFIG" "$TMP_CONFIG" "$TMP_MIGRATIONS_DIR" "$D1_BINDING" <<'PY'
import sys, re
src, dst, migrations_dir, binding = sys.argv[1:5]
with open(src) as f:
    content = f.read()
# Rewrite only the migrations_dir for the target binding's [[d1_databases]]
# block; leave database_name/database_id untouched so this still points at
# the SAME D1 the caller already resolved via --config.
pattern = re.compile(
    r'(\[\[d1_databases\]\]\s*\nbinding\s*=\s*"' + re.escape(binding) + r'"[^\[]*?migrations_dir\s*=\s*")[^"]*(")',
    re.MULTILINE,
)
new_content, n = pattern.subn(r'\g<1>' + migrations_dir.replace('\\', '\\\\') + r'\g<2>', content)
if n == 0:
    raise SystemExit(f"ERROR: could not find migrations_dir for binding {binding!r} in {src}")
with open(dst, 'w') as f:
    f.write(new_content)
PY

echo "== Isolated wrangler config: $TMP_CONFIG =="
grep -A6 '\[\[d1_databases\]\]' "$TMP_CONFIG" | head -8

# AIRTRUST_D1_PERSIST_TO is optional and local-only — it lets a caller point
# at a specific on-disk local D1 state directory (e.g. a disposable rehearsal
# copy) instead of Wrangler's default .wrangler/state. Never set for real use
# against production; --remote is refused above regardless.
PERSIST_ARGS=()
if [[ -n "${AIRTRUST_D1_PERSIST_TO:-}" ]]; then
  PERSIST_ARGS=(--persist-to "$AIRTRUST_D1_PERSIST_TO")
fi

echo "== Pending migrations (isolated view) =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 migrations list "$D1_BINDING" --local --config "$TMP_CONFIG" "${PERSIST_ARGS[@]}")

echo "== Applying isolated migrations =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 migrations apply "$D1_BINDING" --local --config "$TMP_CONFIG" "${PERSIST_ARGS[@]}")

echo "== Ledger after apply (should show only the 3 authorized names) =="
(cd "$REPO_ROOT/worker-airtrust" && npx --no-install wrangler d1 execute "$D1_BINDING" --local --config "$TMP_CONFIG" --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id" "${PERSIST_ARGS[@]}")
