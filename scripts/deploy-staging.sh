#!/bin/bash
# deploy-staging.sh - Deploy para ambiente STAGING (zero cache)

set -e

echo "🚀 === DEPLOY STAGING (ZERO CACHE) ==="
echo ""

# 1. Build
echo "📦 1/3 Building project..."
npm run build
echo "✅ Build complete"
echo ""

# 2. Deploy Worker (staging)
echo "⚡ 2/3 Deploying Worker to staging..."
cd worker-airtrust
npx wrangler deploy --env staging
cd ..
echo "✅ Worker deployed to: https://airtrust-api-staging.workers.dev"
echo ""

# 3. Deploy Pages (main branch = staging)
echo "🌐 3/3 Deploying Pages (staging)..."
npx wrangler pages deploy dist/client --project-name=airtrust --branch=main
echo "✅ Pages deployed to: https://main.airtrust.pages.dev"
echo ""

echo "🎉 STAGING DEPLOYMENT COMPLETE!"
echo ""
echo "📝 Staging URLs:"
echo "   API: https://airtrust-api-staging.workers.dev"
echo "   Web: https://main.airtrust.pages.dev"
echo ""
echo "⚡ Cache: ZERO (instant updates)"
echo ""
