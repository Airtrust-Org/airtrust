#!/bin/bash
# deploy-production-full.sh - Deploy completo para PRODUCTION

set -e

echo "🚀 DEPLOY PRODUCTION COMPLETO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  WARNING: This will deploy to PRODUCTION!"
echo "⚠️  Make sure you tested on STAGING first!"
echo ""
read -p "Continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
  echo "❌ Deploy cancelled"
  exit 1
fi

# 1. Build do React
echo "📦 1/3 Building React app..."
npm run build
echo "✅ React build complete"
echo ""

# 2. Deploy API Backend
echo "🔧 2/3 Deploying API Backend (production)..."
cd worker-airtrust
npx wrangler deploy --env production
cd ..
echo "✅ API deployed"
echo ""

# 3. Frontend oficial é Cloudflare Pages; não há mais deploy do worker-frontend no fluxo padrão
echo "🌐 3/3 Frontend oficial: Cloudflare Pages"
echo "ℹ️  O domínio principal é servido por Cloudflare Pages."
echo "ℹ️  O worker-frontend foi retirado do fluxo de deploy ativo"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ PRODUCTION DEPLOYMENT COMPLETE!"
echo ""
echo "🌐 URLs:"
echo "   Frontend principal: https://airtrust.online"
echo "   API: https://airtrust-api-production.airtrust.workers.dev"
echo ""
echo "⚡ Cache: Optimized for performance"
