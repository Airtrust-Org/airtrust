#!/usr/bin/env bash
set -euo pipefail

echo "ERROR: This legacy database backup script is disabled." >&2
echo "Use the current reviewed backup procedure or scripts/sync-d1-production-sanitized.sh for an approved non-production sync." >&2
echo "No database was queried and no file was created." >&2
exit 1
