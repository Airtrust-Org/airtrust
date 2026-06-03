#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
MIGRATION_FILE="$WORKER_DIR/migrations/0385_audit_events_v2.sql"

if [[ "${AIRTRUST_ALLOW_AUDIT_V2_LOCAL_CHECK:-}" != "YES" ]]; then
  echo "STATUS=SKIPPED_AUDIT_V2_LOCAL_CHECK"
  echo "REASON=AIRTRUST_ALLOW_AUDIT_V2_LOCAL_CHECK_not_set"
  exit 0
fi

TARGET="${AIRTRUST_AUDIT_V2_TARGET:-}"
if [[ -z "$TARGET" ]]; then
  echo "STATUS=SKIPPED_AUDIT_V2_TARGET_UNSET"
  echo "REASON=AIRTRUST_AUDIT_V2_TARGET_not_set"
  exit 0
fi

case "$TARGET" in
  production)
    echo "STATUS=FAIL"
    echo "REASON=production_target_refused"
    exit 1
    ;;
  local)
    ;;
  staging)
    echo "STATUS=SKIPPED_NO_APPROVED_ENV"
    echo "REASON=staging_requires_non_remote_approved_runner"
    exit 0
    ;;
  *)
    echo "STATUS=SKIPPED_NO_APPROVED_ENV"
    echo "REASON=unsupported_target_$TARGET"
    exit 0
    ;;
esac

if [[ ! -f "$MIGRATION_FILE" ]]; then
  echo "STATUS=FAIL"
  echo "REASON=migration_0385_missing"
  exit 1
fi

if grep -Eiq '\b(DROP|DELETE|UPDATE)\b' "$MIGRATION_FILE"; then
  echo "STATUS=FAIL"
  echo "REASON=migration_contains_destructive_sql"
  exit 1
fi

command -v sqlite3 >/dev/null 2>&1 || {
  echo "STATUS=SKIPPED_NO_APPROVED_ENV"
  echo "REASON=sqlite3_not_available"
  exit 0
}

cd "$WORKER_DIR"
npx vitest run \
  src/__tests__/migrations/audit-events-v2-schema.test.ts \
  src/__tests__/audit/audit-events-v2-activation-readiness.test.ts

echo "STATUS=PASS"
echo "TARGET=local"
echo "SCHEMA_CREATED_LOCALLY=yes"
echo "FLAG_DEFAULT_OFF=confirmed"
echo "PII_FOUND=no"
