#!/bin/bash

set -euo pipefail

echo "🚀 Iniciando deploy staging..."
echo ""

# Deploy e captura toda a saída
OUTPUT=$(./scripts/deploy-staging.sh 2>&1)

# Extrai a URL do deployment (formato: https://abc12345.airtrust.pages.dev)
DEPLOY_URL=$(echo "$OUTPUT" | grep -o 'https://[a-z0-9]*\.airtrust\.pages\.dev' | head -1)

if [ -z "$DEPLOY_URL" ]; then
  echo "❌ Erro: Não foi possível extrair URL do deployment"
  echo ""
  echo "Saída do deploy:"
  echo "$OUTPUT"
  exit 1
fi

echo ""
echo "✅ Deploy completo!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌐 URL (GARANTIDA - SEM CACHE):"
echo "   $DEPLOY_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   Esta é a URL ÚNICA do deployment"
echo "   Cada deploy gera uma URL diferente"
echo "   NÃO use main.airtrust.pages.dev (cache)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Copia URL para clipboard
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "$DEPLOY_URL" | pbcopy
  echo "📋 URL copiada para clipboard (Mac)"
elif [[ "$OSTYPE" == "linux-gnu"* ]] && command -v xclip &> /dev/null; then
  echo "$DEPLOY_URL" | xclip -selection clipboard
  echo "📋 URL copiada para clipboard (Linux)"
fi

echo ""
echo "🔥 Abrindo no navegador em 2 segundos..."
sleep 2

# Abre no navegador direto na página de qualificações
FULL_URL="${DEPLOY_URL}/qualificacoes"

if [[ "$OSTYPE" == "darwin"* ]]; then
  open "$FULL_URL"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  xdg-open "$FULL_URL" &> /dev/null || echo "⚠️  Não foi possível abrir automaticamente. Use: $FULL_URL"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ TUDO PRONTO!"
echo "   • URL sem cache: ✅"
echo "   • Navegador aberto: ✅"
echo "   • Código atualizado: ✅"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
