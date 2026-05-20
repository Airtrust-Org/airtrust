#!/bin/bash

# Script FINAL de verificação - compara airtrust.online com o que será servido

echo "📊 VERIFICAÇÃO FINAL - Sistema Honesto"
echo "====================================="
echo ""

# Pegar versão de airtrust.online
echo "🔍 Checando airtrust.online..."
DOMAIN_VERSION=$(curl -s https://airtrust.online | grep -o 'build-version" content="[^"]*"' | cut -d'"' -f4)
DOMAIN_BUNDLE=$(curl -s https://airtrust.online/index.html | grep -o 'index-[A-Za-z0-9]*\.js' | head -1)

[ -z "$DOMAIN_VERSION" ] && DOMAIN_VERSION="ERROR"
[ -z "$DOMAIN_BUNDLE" ] && DOMAIN_BUNDLE="ERROR"

echo "   Version: $DOMAIN_VERSION"
echo "   Bundle:  $DOMAIN_BUNDLE"
echo ""

if [ "$DOMAIN_VERSION" != "ERROR" ]; then
  echo "✅ SUCESSO!"
  echo ""
  echo "Domínio airtrust.online está com:"
  echo "  • Versão: $DOMAIN_VERSION"
  echo "  • Bundle: $DOMAIN_BUNDLE"
  echo ""
  echo "🚀 Próximo deploy:"
  echo "  $ npm run build && ./deploy-full-automated.sh"
  echo ""
  echo "Footer mostrará a versão exata que está em production!"
else
  echo "❌ ERRO ao conectar em airtrust.online"
fi

echo "====================================="
echo "Timestamp: $(date)"

