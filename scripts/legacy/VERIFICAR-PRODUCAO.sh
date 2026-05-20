#!/bin/bash

echo "✅ VERIFICAÇÃO FINAL - airtrust.online"
echo "======================================"
echo ""

DOMAIN_DATA=$(curl -s https://airtrust.online)

if echo "$DOMAIN_DATA" | grep -q "build-version"; then
  VERSION=$(echo "$DOMAIN_DATA" | grep -o 'build-version" content="[^"]*' | cut -d'"' -f4)
  echo "✅ airtrust.online está respondendo"
  echo ""
  echo "Versão em produção: $VERSION"
  echo ""
  echo "🎯 Sistema de versionamento honesto está COMPLETO!"
  echo ""
  echo "Sempre que fizer deploy:"
  echo "  \$ npm run build && ./deploy-full-automated.sh"
  echo ""
  echo "O footer mostrará a versão exata que está sendo servida."
else
  echo "❌ Erro ao conectar em airtrust.online"
fi

echo "======================================"

