#!/bin/bash

# Script para verificar status da sincronização e guiar próximos passos

set -e

echo "📊 STATUS ATUAL DA SINCRONIZAÇÃO"
echo "================================="
echo ""

# Verificar build version no Pages Production
echo "1️⃣  Checando Pages Production (production.airtrust.pages.dev)..."
PAGES_HTML=$(curl -s https://production.airtrust.pages.dev)
PAGES_VERSION=$(echo "$PAGES_HTML" | grep -o 'name="build-version" content="[^"]*"' | cut -d'"' -f4 | head -1)
PAGES_BUNDLE=$(echo "$PAGES_HTML" | grep -o 'index-[A-Za-z0-9]*\.js' | head -1)

[ -z "$PAGES_VERSION" ] && PAGES_VERSION="ERROR"
[ -z "$PAGES_BUNDLE" ] && PAGES_BUNDLE="ERROR"

echo "   Version: $PAGES_VERSION"
echo "   Bundle:  $PAGES_BUNDLE"

# Verificar build version em airtrust.online
echo ""
echo "2️⃣  Checando airtrust.online (seu domínio)..."
DOMAIN_HTML=$(curl -s https://airtrust.online)
DOMAIN_VERSION=$(echo "$DOMAIN_HTML" | grep -o 'name="build-version" content="[^"]*"' | cut -d'"' -f4 | head -1)
DOMAIN_BUNDLE=$(echo "$DOMAIN_HTML" | grep -o 'index-[A-Za-z0-9]*\.js' | head -1)

[ -z "$DOMAIN_VERSION" ] && DOMAIN_VERSION="ERROR"
[ -z "$DOMAIN_BUNDLE" ] && DOMAIN_BUNDLE="ERROR"

echo "   Version: $DOMAIN_VERSION"
echo "   Bundle:  $DOMAIN_BUNDLE"

# Comparar
echo ""
echo "3️⃣  Comparação:"
echo "================================="

if [ "$PAGES_VERSION" = "$DOMAIN_VERSION" ] && [ "$PAGES_BUNDLE" = "$DOMAIN_BUNDLE" ]; then
    echo "✅ SINCRONIZADO!"
    echo ""
    echo "   Versão coincide: $PAGES_VERSION"
    echo "   Bundle coincide: $PAGES_BUNDLE"
    echo ""
    echo "🎉 Sistema de versionamento honesto está COMPLETO!"
    echo ""
    echo "Próximos deploys:"
    echo "  $ npm run build"
    echo "  $ npm run deploy  (ou ./deploy-full-automated.sh)"
    echo ""
    echo "Footer mostrará a versão correta automaticamente em cada deploy."
else
    echo "❌ DESINCRONIZADO"
    echo ""
    echo "   Pages:         $PAGES_VERSION ($PAGES_BUNDLE)"
    echo "   airtrust.online: $DOMAIN_VERSION ($DOMAIN_BUNDLE)"
    echo ""
    echo "Solução: Configure Custom Domain no Cloudflare Dashboard"
    echo "  1. https://dash.cloudflare.com/"
    echo "  2. Pages → airtrust → Custom Domains"
    echo "  3. Clique em airtrust.online → Branch: production"
    echo "  4. Aguarde 30-60 segundos e rode este script novamente"
    echo ""
    echo "Leia: ./PRÓXIMOS-PASSOS-SINCRONIZACAO.md"
fi

echo ""
echo "================================="
echo "Timestamp: $(date)"
