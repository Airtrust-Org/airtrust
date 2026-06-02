#!/usr/bin/env bash
set -euo pipefail

echo "ERROR: This production E2E DB mutation script is blocked."
echo "Use a local or staging-only test path; direct remote D1 execution from this script is disabled."
exit 1
