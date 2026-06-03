#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"

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

cd "$WORKER_DIR"
AUDIT_EVENTS_V2_DUAL_WRITE=true npx vitest run \
  src/__tests__/audit/audit-events-v2-writer.test.ts \
  src/__tests__/routes/lms-cursos-beta-contract.test.ts

echo "STATUS=PASS"
echo "TARGET=local"
echo "DUAL_WRITE_LOCAL=yes"
echo "LEGACY_WRITER_PRESERVED=yes"
echo "V2_WRITER_FAILURE_ISOLATED=yes"
echo "PII_FOUND=no"
