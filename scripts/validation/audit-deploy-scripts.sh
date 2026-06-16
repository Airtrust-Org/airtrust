#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SAFE_SCRIPT="$ROOT_DIR/scripts/deploy-worker-safe.sh"
DEPLOY_WORKFLOW="$ROOT_DIR/.github/workflows/deploy.yml"

if [[ ! -f "$SAFE_SCRIPT" ]]; then
  echo "❌ Script não encontrado: $SAFE_SCRIPT" >&2
  exit 1
fi

echo "=== Audit: scripts com migrations apply ==="
# Read-only inventory. Non-zero grep should not fail this listing step.
grep -R "migrations apply" -n "$ROOT_DIR/package.json" "$ROOT_DIR/worker-airtrust/package.json" "$ROOT_DIR/scripts" "$ROOT_DIR/docs" "$ROOT_DIR/.github" 2>/dev/null || true

echo
echo "=== Audit: Deploy AirTrust local setup guard ==="
if grep -n "setup:local:reset" "$DEPLOY_WORKFLOW"; then
  echo "❌ Deploy AirTrust workflow usa setup local amplo dependente de seed-local.sql" >&2
  exit 1
fi

if ! grep -n "setup:lms:local:reset" "$DEPLOY_WORKFLOW" >/dev/null; then
  echo "❌ Deploy AirTrust workflow não usa setup local sintético do LMS" >&2
  exit 1
fi

echo "✅ Deploy AirTrust usa setup local sintético sem seed-local.sql"

echo
echo "=== Audit: deploy-worker-safe forbidden tokens ==="
if grep -nE "migrations apply|wrangler d1|seed|deduplicate|sync" "$SAFE_SCRIPT"; then
  echo "❌ deploy-worker-safe contém comando proibido" >&2
  exit 1
fi

echo "✅ deploy-worker-safe sem comandos proibidos"
