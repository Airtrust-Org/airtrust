#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "❌ scripts/sync-prod-simple.sh foi aposentado por segurança."
echo "✅ Use: AIRTRUST_ALLOW_PROD_SYNC=1 $ROOT_DIR/scripts/sync-d1-production-sanitized.sh --target local --yes"
exit 1
