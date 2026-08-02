#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
ERROR: This legacy raw production-data cloning script is blocked.

It previously copied complete D1 tables, including personal and sensitive data,
from production into local files and a local database without sanitization or
encryption. That workflow is not an approved AirTrust data-handling path.

Use scripts/sync-d1-production-sanitized.sh only in an explicitly approved
non-production synchronization window. For backups, use the current reviewed
backup and restore procedure; do not re-enable this script.

No database was queried and no file was created.
EOF

exit 1
