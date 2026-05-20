#!/bin/bash
# deploy-all.sh - Deploy completo do AirTrust (API + Frontend)

set -e

echo "🚀 DEPLOY COMPLETO DO AIRTRUST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Build do React
echo "📦 1/3 Building React app..."
npm run build
echo "✅ React build complete"
echo ""

# 2. Deploy API Backend
echo "🔧 2/3 Deploying API Backend..."
cd worker-airtrust
npx wrangler deploy --env staging
cd ..
echo "✅ API deployed"
echo ""

# 3. Frontend oficial é Cloudflare Pages; não há mais deploy do worker-frontend no fluxo padrão
echo "🌐 3/3 Frontend oficial: Cloudflare Pages"
echo "ℹ️  O worker-frontend foi retirado do fluxo de deploy ativo"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DEPLOY COMPLETO!"
echo ""
echo "🌐 URLs:"
echo "   Frontend: https://main.airtrust.pages.dev"
echo "   API: https://airtrust-api-staging.airtrust.workers.dev"
echo ""
echo "⚡ ZERO CACHE - Updates instantâneos!"
echo ""
echo "📝 Próximos passos:"
echo "   1. Acesse: https://airtrust-frontend-staging.workers.dev"
echo "   2. Teste o sistema"
echo "   3. Se OK, faça deploy production: ./scripts/deploy-production-full.sh"
