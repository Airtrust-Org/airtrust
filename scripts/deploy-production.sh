#!/usr/bin/env bash
set -euo pipefail

echo "ERROR: scripts/deploy-production.sh is a blocked legacy path."
echo "Use one of the reviewed flows instead:"
echo "  - npm run deploy:pages"
echo "  - npm run deploy:worker:safe"
echo "  - bash scripts/deploy-worker-only.sh with explicit migration env gates"
exit 1
