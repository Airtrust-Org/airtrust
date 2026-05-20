#!/bin/bash

set -e

ACCOUNT_ID="4dca4e5fddc6a351651dd224f456586f"
PROJECT_NAME="airtrust"
DOMAIN="airtrust.online"
BRANCH="production"

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ Erro: CLOUDFLARE_API_TOKEN não definido"
  exit 1
fi

echo "🔗 Atualizando custom domain airtrust.online para branch production..."
echo "   Token: ${CLOUDFLARE_API_TOKEN:0:10}..."

# Remover domain
echo "1️⃣ Removendo domain antigo..."
REMOVE_RESP=$(curl -s -X DELETE "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains/$DOMAIN" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json")

if echo "$REMOVE_RESP" | grep -q '"success":true'; then
  echo "✅ Domain removido"
else
  echo "⚠️ Domain pode estar limpo já"
fi

sleep 2

# Adicionar domain com branch
echo "2️⃣ Adicionando domain com branch production..."

# Tenta POST no endpoint correto
ADD_RESP=$(curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"domain\": \"$DOMAIN\", \"branch\": \"$BRANCH\"}")

echo "$ADD_RESP" | python3 -m json.tool 2>/dev/null || echo "$ADD_RESP"

if echo "$ADD_RESP" | grep -q '"success":true'; then
  echo ""
  echo "✅ Domain adicionado com sucesso!"
  echo "⏳ Aguardando propagação DNS (30-60 segundos)..."
else
  # Se falha, tenta PUT alternativo
  echo ""
  echo "⚠️ POST falhou, tentando PUT..."
  PUT_RESP=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/$PROJECT_NAME/domains/$DOMAIN" \
    -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"branch\": \"$BRANCH\"}")
  
  echo "$PUT_RESP" | python3 -m json.tool 2>/dev/null || echo "$PUT_RESP"
  
  if echo "$PUT_RESP" | grep -q '"success":true'; then
    echo "✅ Domain atualizado com sucesso!"
    echo "⏳ Aguardando propagação DNS (30-60 segundos)..."
  else
    echo "❌ Falha ao adicionar/atualizar domain"
  fi
fi

