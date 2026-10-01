#!/usr/bin/env bash
set -euo pipefail

echo "LOCAL_PAGES_FORCE_REDEPLOY_DISABLED_USE_GITHUB_ACTIONS" >&2
echo "❌ Commit/push based Pages redeploy is disabled." >&2
echo "   Use the governed GitHub Actions release workflow instead." >&2
echo "   Production: .github/workflows/deploy-airtrust.yml" >&2
exit 1
