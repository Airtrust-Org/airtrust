#!/usr/bin/env bash
set -euo pipefail

echo "ERROR: This legacy destructive production/staging seed script is blocked."
echo "Use local seed flows for development, or scripts/run-production-db-script.sh with an allowlisted SQL file and explicit production confirmation."
exit 1
