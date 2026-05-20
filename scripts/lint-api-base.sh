#!/usr/bin/env bash
set -euo pipefail

# Guard against hardcoded relative API paths in frontend code.
# Allowed: worker code under src/worker, backups, tests.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🔎 Checking for hardcoded '/api/v2' in frontend code..."

if command -v rg >/dev/null 2>&1; then
  violations=$(rg -n -F "/api/v2" \
    "$ROOT_DIR/src" \
    -g '!src/worker/**' \
    -g '!**/_backups/**' \
    -g '!src/test/**' \
    -g '!src/__tests__/**' \
    -g '!**/*.md' \
    || true)
else
  violations=$(grep -R -n "/api/v2" \
    "$ROOT_DIR/src" \
    | grep -v "/src/worker/" \
    | grep -v "/_backups/" \
    | grep -v "/src/test/" \
    | grep -v "/src/__tests__/" \
    | grep -v "\.md:" \
    || true)
fi

if [[ -n "$violations" ]];
then
  echo "❌ Found forbidden hardcoded '/api/v2' in frontend files:"
  echo "$violations"
  echo
  echo "💡 Use API_BASE_URL from config (e.g., import from src/react-app/config/api.ts)"
  exit 1
else
  echo "✅ No hardcoded '/api/v2' found in frontend code."
fi

echo "🔎 Checking that build-time VITE_API_URL is provided in CI environments (optional local)"
if [[ -n "${CI:-}" ]]; then
  if [[ -z "${VITE_API_URL:-}" ]]; then
    echo "❌ CI build must set VITE_API_URL environment variable"
    exit 1
  fi
fi

echo "✅ URL guard checks passed"
