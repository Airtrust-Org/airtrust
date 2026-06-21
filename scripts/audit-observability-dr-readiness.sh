#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Usage:
  ./scripts/audit-observability-dr-readiness.sh

Purpose:
  Read-only inventory of observability, backup, restore/DR and production-touchpoint assets.

Notes:
  - Does not run deploys, migrations, restore, or remote writes.
  - Prints inventory references so operators can identify risky historical scripts.
EOF
  exit 0
fi

print_section() {
  printf '\n=== %s ===\n' "$1"
}

show_file() {
  local path="$1"
  if [[ -f "$path" ]]; then
    printf 'OK  %s\n' "${path#$ROOT_DIR/}"
  else
    printf 'MISS %s\n' "${path#$ROOT_DIR/}"
  fi
}

print_section "Repo"
printf 'cwd=%s\n' "$ROOT_DIR"
printf 'branch=%s\n' "$(git branch --show-current 2>/dev/null || echo unknown)"
printf 'head=%s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"

print_section "Core Docs"
show_file "$ROOT_DIR/DEPLOYMENT_AND_DEVOPS.md"
show_file "$ROOT_DIR/SECURITY.md"
show_file "$ROOT_DIR/ARCHITECTURE_OVERVIEW.md"
show_file "$ROOT_DIR/DATABASE_SCHEMA.md"

print_section "Observability Signals"
rg -n \
  -e 'requestIdMiddleware' \
  -e 'X-Request-ID' \
  -e 'X-AirTrust-Version' \
  -e '/api/health' \
  -e '/api/version' \
  -e 'client-error' \
  "$ROOT_DIR/worker-airtrust/src/index.ts" \
  "$ROOT_DIR/worker-airtrust/src/routes/system.ts" \
  "$ROOT_DIR/worker-airtrust/src/middleware/requestId.ts" \
  "$ROOT_DIR/worker-airtrust/src/middleware/error-handler.ts" \
  2>/dev/null || true

print_section "Backup And DR Assets"
show_file "$ROOT_DIR/worker-airtrust/src/routes/backup.ts"
show_file "$ROOT_DIR/worker-airtrust/src/services/backup/orchestrator.ts"
show_file "$ROOT_DIR/worker-airtrust/src/services/backup/restore.ts"
show_file "$ROOT_DIR/docs/d1-rollback-drill/sqlite-integrity-check.txt"
show_file "$ROOT_DIR/docs/controlled-execution/mig01-staging-rollback-plan-20260604.md"
show_file "$ROOT_DIR/docs/AIRTRUST_OBSERVABILITY_DR_BACKUP_RESTORE_READINESS_20260621.md"
show_file "$ROOT_DIR/docs/operational-hardening/AIRTRUST_RESTORE_DRILL_RUNBOOK_20260621.md"
show_file "$ROOT_DIR/docs/operational-hardening/AIRTRUST_ROLLBACK_RUNBOOK_20260621.md"

print_section "Prod Touchpoints Inventory"
rg -n \
  -g '!docs/arquivo/**' \
  -e 'wrangler deploy --env production' \
  -e 'wrangler pages deploy' \
  -e 'wrangler tail --env production' \
  -e 'd1 migrations apply .*--remote' \
  -e 'd1 execute .*--remote' \
  "$ROOT_DIR/package.json" \
  "$ROOT_DIR/worker-airtrust/package.json" \
  "$ROOT_DIR/scripts" \
  "$ROOT_DIR/worker-airtrust/src" \
  "$ROOT_DIR/.github/workflows" \
  2>/dev/null || true

print_section "Dangerous Legacy Scripts"
show_file "$ROOT_DIR/scripts/backup_d1_to_r2.sh"
show_file "$ROOT_DIR/scripts/sync-production-to-local.sh"
show_file "$ROOT_DIR/scripts/legacy/restore-prod-data.py"
show_file "$ROOT_DIR/scripts/legacy/restore-db-final.py"

print_section "Readiness Summary"
printf '%s\n' \
  '1. Use this inventory only for read-only readiness checks.' \
  '2. Production writes, remote D1 execution, deploys and real restores remain out of scope here.' \
  '3. Authenticated cross-tenant validation still depends on an approved fixture/session.'
