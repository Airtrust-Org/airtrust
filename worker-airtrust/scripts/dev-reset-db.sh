#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_FILE="${ROOT_DIR}/../.wrangler/state/v3/d1/airtrust-local-fixed.sqlite"

echo "🔄 Reset local D1 dev database (consolidated schema)"
if [ -f "$DB_FILE" ]; then
  echo "🗑  Removing existing sqlite file: $DB_FILE"
  rm -f "$DB_FILE"
else
  echo "ℹ️  No existing DB file found (fresh start)."
fi

echo "📦 Bootstrapping schema + seed + view"
wrangler d1 execute DB --local --file dev_bootstrap.sql

echo "✅ Local dev database ready"
