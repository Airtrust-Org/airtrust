#!/bin/bash
# verificar-versao-producao.sh
# Script para VERIFICAR HONESTAMENTE qual versão do UI está em produção
# Não depende do rodapé — mostra o bundle REAL servido

set -e

echo "🔍 VERIFICAÇÃO DE VERSÃO - PRODUÇÃO (HONESTA)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Verificar production.airtrust.pages.dev (Pages production)
echo "📍 Pages Production (production.airtrust.pages.dev):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
PAGES_PROD=$(curl -sL https://production.airtrust.pages.dev/ 2>/dev/null | grep -E "build-version|assets/index-" | head -2 || echo "indisponível")
if [ -n "$PAGES_PROD" ]; then
  echo "$PAGES_PROD" | grep "build-version" && echo "" && echo "$PAGES_PROD" | grep "assets/index-"
else
  echo "❌ Não conseguiu acessar ou erro no parsing"
fi
echo ""

# 2. Verificar airtrust.online (domínio principal)
echo "📍 Domain Production (airtrust.online):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
DOMAIN_PROD=$(curl -sL https://airtrust.online/ 2>/dev/null | grep -E "build-version|assets/index-" | head -2 || echo "indisponível")
if [ -n "$DOMAIN_PROD" ]; then
  echo "$DOMAIN_PROD" | grep "build-version" && echo "" && echo "$DOMAIN_PROD" | grep "assets/index-"
else
  echo "❌ Não conseguiu acessar ou erro no parsing"
fi
echo ""

# 3. Comparação
echo "📊 COMPARAÇÃO:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
PAGES_BUNDLE=$(echo "$PAGES_PROD" | grep "assets/index-" | sed 's/.*assets\/index-//' | sed 's/\.js.*//' | head -1)
DOMAIN_BUNDLE=$(echo "$DOMAIN_PROD" | grep "assets/index-" | sed 's/.*assets\/index-//' | sed 's/\.js.*//' | head -1)

PAGES_VERSION=$(echo "$PAGES_PROD" | grep "build-version" | sed 's/.*content="//' | sed 's/".*//' | head -1)
DOMAIN_VERSION=$(echo "$DOMAIN_PROD" | grep "build-version" | sed 's/.*content="//' | sed 's/".*//' | head -1)

echo ""
echo "Pages Production:          bundle=$PAGES_BUNDLE | version=$PAGES_VERSION"
echo "airtrust.online:           bundle=$DOMAIN_BUNDLE | version=$DOMAIN_VERSION"
echo ""

if [ "$PAGES_BUNDLE" = "$DOMAIN_BUNDLE" ]; then
  echo "✅ SINCRONIZADO! Ambos estão servindo o mesmo bundle."
else
  echo "❌ DESINCRONIZADO! Bundles diferentes:"
  echo "   - Pages Production:  $PAGES_BUNDLE"
  echo "   - airtrust.online:   $DOMAIN_BUNDLE"
  echo ""
  echo "   → Ação necessária: Atualizar custom domain no Cloudflare"
  echo "     (ver instruções em CONFIGURAR-CLOUDFLARE-PAGES.md)"
fi

echo ""
echo "📝 Dicas:"
echo "  • Se os bundles forem iguais → versão correta em produção!"
echo "  • Se forem diferentes → Pages production não está linkado ao airtrust.online"
echo "  • O rodapé deve mostrar a mesma versão em ambos os sites"
echo ""
