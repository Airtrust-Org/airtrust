#!/usr/bin/env bash
set -euo pipefail

echo "LOCAL_STAGING_DEPLOY_DISABLED_USE_GITHUB_ACTIONS" >&2
echo "❌ Legacy local full staging deploy is disabled." >&2
echo "   Use the governed GitHub Actions workflow: .github/workflows/deploy-staging.yml" >&2
echo "   The reviewed staging-only emergency/diagnostic entrypoints remain separately gated." >&2
exit 1
