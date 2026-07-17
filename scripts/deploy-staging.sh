#!/usr/bin/env bash
# deploy-staging.sh — LEGACY PATH BLOCKED.
# Use the provenance-safe Worker deploy or the official GitHub workflow instead.
#
# Official options:
#   1) npm run deploy:staging:worker:safe
#   2) .github/workflows/deploy-staging.yml (workflow_dispatch)
#
# This legacy script previously ran `wrangler deploy --env staging` without
# injecting APP_VERSION, which published remote staging as version=dev-local.

set -euo pipefail

echo "❌ BLOCKED: scripts/deploy-staging.sh is retired." >&2
echo "   It deployed staging without an auditable APP_VERSION stamp (dev-local)." >&2
echo "   Use one of:" >&2
echo "     AIRTRUST_ALLOW_STAGING_WORKER_DEPLOY=YES \\" >&2
echo "     AIRTRUST_CONFIRM_STAGING_WORKER_DEPLOY='I understand this deploys the AirTrust staging worker' \\" >&2
echo "     npm run deploy:staging:worker:safe" >&2
echo "   or the official workflow Deploy Staging (Official)." >&2
exit 1
