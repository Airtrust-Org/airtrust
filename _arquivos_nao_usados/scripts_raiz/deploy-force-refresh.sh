#!/bin/bash

set -e

echo "🧹 LIMPEZA TOTAL DE CACHE E DEPLOY FORÇADO"
echo "=========================================="

# 1. Limpar dist local
echo "📁 Removendo dist/ local..."
rm -rf dist/

# 2. Limpar node_modules/.vite (cache do Vite)
echo "🗑️  Limpando cache do Vite..."
rm -rf node_modules/.vite

# 3. Build com timestamp único
echo "🔨 Building com hash único..."
BUILD_VERSION=$(date +%s)
npm run build

# 4. Adicionar timestamp no index.html
echo "📝 Injetando versão no HTML..."
sed -i '' "s/__BUILD_VERSION__/${BUILD_VERSION}/g" dist/client/index.html

# 5. Commit
echo "📝 Commitando mudanças..."
git add -A
git commit -m "deploy: force cache refresh [build-${BUILD_VERSION}]" || echo "Nada para commitar"

# 6. Push
echo "🚀 Pushing para GitHub..."
git push

echo ""
echo "✅ DEPLOY COMPLETO!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 Frontend: https://production.airtrust.pages.dev"
echo "🔧 Backend:  https://airtrust.airtrust.workers.dev"
echo ""
echo "⏱️  Aguarde 30-60 segundos para o Cloudflare Pages fazer deploy"
echo ""
echo "💡 Para forçar refresh no navegador:"
echo "   • Chrome/Edge: Ctrl+Shift+R (Windows) ou Cmd+Shift+R (Mac)"
echo "   • Firefox: Ctrl+F5 (Windows) ou Cmd+Shift+R (Mac)"
echo "   • Safari: Cmd+Option+R"
echo ""
echo "🔥 Ou abra em aba anônima: Ctrl+Shift+N / Cmd+Shift+N"
echo ""
