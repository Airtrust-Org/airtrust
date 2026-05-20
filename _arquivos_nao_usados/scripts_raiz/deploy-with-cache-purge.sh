#!/bin/bash
# ===== DEPLOY COMPLETO COM PURGE DE CACHE =====
# Script automatizado para deploy de Worker + Pages + Purge de cache
# Uso: ./deploy-with-cache-purge.sh

set -e  # Exit on error

echo "🚀 ===== DEPLOY COMPLETO - AIRTRUST ====="
echo ""

# ===== 1. BUILD FRONTEND =====
echo "📦 1/4 - Building frontend..."
npm run build
echo "✅ Build completo"
echo ""

# ===== 2. DEPLOY WORKER =====
echo "⚙️  2/4 - Deploying Worker..."
cd worker-airtrust
npx wrangler deploy --env=""
WORKER_VERSION=$(npx wrangler deployments list --format json 2>/dev/null | jq -r '.[0].id' 2>/dev/null || echo "unknown")
cd ..
echo "✅ Worker deployed: $WORKER_VERSION"
echo ""

# ===== 3. DEPLOY PAGES =====
echo "📄 3/4 - Deploying Pages..."
DEPLOY_OUTPUT=$(npx wrangler pages deploy dist --project-name=airtrust-production 2>&1)
PAGES_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[a-z0-9]*\.airtrust-production\.pages\.dev' | head -1)
echo "✅ Pages deployed: $PAGES_URL"
echo ""

# ===== 4. PURGE CACHE (OPCIONAL) =====
echo "🗑️  4/4 - Purging cache..."
if [ -f ".env" ]; then
    # Se tiver .env com credenciais, purgar cache
    if command -v node &> /dev/null && [ -f "scripts/purge-pages-cache.js" ]; then
        export $(cat .env | grep -v '^#' | xargs)
        node scripts/purge-pages-cache.js || echo "⚠️  Cache purge script not available or failed"
    else
        echo "ℹ️  Skipping automatic cache purge (no script or node)"
    fi
else
    echo "ℹ️  Skipping cache purge (.env not found)"
fi
echo ""

# ===== RESULTADO =====
echo "🎉 ===== DEPLOY COMPLETO ====="
echo ""
echo "📊 URLs:"
echo "  Worker:  https://airtrust.airtrust.workers.dev"
echo "  Pages:   $PAGES_URL"
echo "  Prod:    https://production.airtrust.pages.dev"
echo ""
echo "💡 Dicas:"
echo "  1. Teste a nova versão: $PAGES_URL"
echo "  2. Aguarde 1-2 minutos para propagação global"
echo "  3. Force refresh no navegador: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Win)"
echo "  4. Purge cache manual: Cloudflare Dashboard → Caching → Purge Everything"
echo ""
echo "✅ Deploy finalizado!"
