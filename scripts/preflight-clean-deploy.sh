#!/usr/bin/env bash
set -euo pipefail

echo "LOCAL_PRODUCTION_DEPLOY_DISABLED_USE_GITHUB_ACTIONS" >&2
echo "❌ Local production deploy is disabled." >&2
echo "   Use the governed GitHub Actions workflow: .github/workflows/deploy-airtrust.yml" >&2
exit 1
