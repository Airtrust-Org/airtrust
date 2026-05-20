#!/bin/bash

set -e

echo "🔄 Sincronizando airtrust.online com branch production..."
echo ""

# Credenciais
ACCOUNT_ID="4dca4e5fddc6a351651dd224f456586f"
PROJECT_NAME="airtrust"
DOMAIN="airtrust.online"
BRANCH="production"

# Usar token se disponível, caso contrário avise
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ CLOUDFLARE_API_TOKEN não configurado"
    echo ""
    echo "Configurar manualmente em: https://dash.cloudflare.com/"
    echo "  1. Pages → airtrust → Custom Domains"
    echo "  2. Clique em airtrust.online"
    echo "  3. Branch → production"
    echo "  4. Save"
    exit 1
fi

echo "📋 Removendo configuração antiga..."
curl -s -X DELETE \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains/$DOMAIN" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" | jq -r '.success' >/dev/null 2>&1

sleep 1

echo "✅ Configurando novo domain..."
RESPONSE=$(curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"domain\": \"$DOMAIN\", \"branch\": \"$BRANCH\"}")

echo "$RESPONSE" | jq '.'

if echo "$RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    echo ""
    echo "✅ Domain configurado com sucesso!"
    echo "⏳ Aguardando propagação (30-60 segundos)..."
    sleep 30
    echo ""
    echo "🔍 Verificando sincronização..."
    ./STATUS-SINCRONIZACAO-ATUAL.sh
else
    echo ""
    echo "❌ Erro ao configurar domain"
    echo "Tente manualmente: https://dash.cloudflare.com/"
fi

