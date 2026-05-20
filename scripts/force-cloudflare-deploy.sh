#!/bin/bash
# ========================================
# FORCE CLOUDFLARE PAGES DEPLOY
# ========================================
# Invalida cache e força novo deploy

set -e

echo "🔥 FORÇANDO DEPLOY CLOUDFLARE PAGES"
echo "===================================="
echo ""

# 1. Rebuild com novo timestamp
echo "📦 1/5 Rebuilding com timestamp único..."
TIMESTAMP=$(date +%s)
npm run build

# 2. Adicionar meta tag com timestamp no index.html
echo "🏷️  2/5 Adicionando timestamp ao index.html..."
sed -i.bak "s/build-version\" content=\"[^\"]*\"/build-version\" content=\"deploy-${TIMESTAMP}\"/" dist/client/index.html
rm -f dist/client/index.html.bak

# 3. Commit forçado
echo "📝 3/5 Commitando com timestamp..."
git add -f dist/
git commit -m "force: cloudflare pages deploy ${TIMESTAMP}" --allow-empty

# 4. Push
echo "🚀 4/5 Pushing para GitHub (trigger Cloudflare)..."
git push origin main

# 5. Aguardar e verificar
echo "⏳ 5/5 Aguardando deploy (60s)..."
sleep 60

echo ""
echo "✅ Deploy iniciado!"
echo ""
echo "🔍 Verificando produção..."
curl -sI https://production.airtrust.pages.dev | grep -i "date\|age\|cache"

echo ""
echo "📋 Para verificar manualmente:"
echo "   https://production.airtrust.pages.dev"
echo "   (Force refresh: Cmd+Shift+R no Mac)"
echo ""
