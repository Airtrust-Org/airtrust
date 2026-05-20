#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

STAMP=$(date +%Y%m%d-%H%M%S)
OUTDIR="db/dev-backups"
mkdir -p "$OUTDIR"

# Find the active local D1 DB used by wrangler (miniflare)
DB_DIR=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"
DB_FILE=$(ls -1t "$DB_DIR"/*.sqlite 2>/dev/null | head -1 || true)
if [[ -z "${DB_FILE:-}" ]]; then
  echo "⚠️  No local D1 sqlite file found under $DB_DIR"
  exit 0
fi

cp "$DB_FILE" "$OUTDIR/airtrust-local-$STAMP.sqlite"
echo "✅ Backup created: $OUTDIR/airtrust-local-$STAMP.sqlite"
