#!/usr/bin/env bash
set -euo pipefail

echo "ERROR: This legacy production reconciliation script is blocked."
echo "Use scripts/run-production-db-script.sh with an allowlisted SQL file and explicit production confirmation."
exit 1
