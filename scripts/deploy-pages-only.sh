#!/usr/bin/env bash
set -euo pipefail

echo "LOCAL_PRODUCTION_PAGES_DEPLOY_DISABLED_USE_GITHUB_ACTIONS" >&2
echo "❌ Local production Pages deploy is disabled." >&2
echo "   Use the governed GitHub Actions workflow: .github/workflows/deploy-airtrust.yml" >&2
echo "   Set deploy_pages=true only inside an explicitly authorized production release." >&2
exit 1
