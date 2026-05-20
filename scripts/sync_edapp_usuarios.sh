#!/bin/bash
# =========================================
# SINCRONIZAÇÃO AUTOMÁTICA EDAPP → AIRTRUST
# Cria mapeamentos de usuários usando codigo_anac como chave
# =========================================

set -e

API_URL="${API_URL:-https://airtrust-api-production.airtrust.workers.dev}"
EDAPP_API_TOKEN="${EDAPP_API_TOKEN:-}"

if [ -z "$EDAPP_API_TOKEN" ]; then
  echo "❌ EDAPP_API_TOKEN não configurado"
  echo "   Exporte EDAPP_API_TOKEN no shell antes de rodar este script"
  exit 1
fi

echo "🔄 ====================================="
echo "   SYNC EDAPP → AIRTRUST"
echo "====================================="
echo ""

# 1. Buscar usuários EdApp
echo "📥 Buscando usuários do EdApp..."
EDAPP_USERS=$(curl -s "https://rest.edapp.com/v2/users" \
  -H "Authorization: Bearer $EDAPP_API_TOKEN" \
  -H "Accept: application/json")

EDAPP_COUNT=$(echo "$EDAPP_USERS" | jq '.totalCount')
echo "   Total EdApp: $EDAPP_COUNT usuários"

# 2. Buscar funcionários AirTrust
echo "📥 Buscando funcionários do AirTrust..."
AIRTRUST_FUNCS=$(curl -s "$API_URL/api/funcionarios?limit=200")
AIRTRUST_COUNT=$(echo "$AIRTRUST_FUNCS" | jq '.data | length')
echo "   Total AirTrust: $AIRTRUST_COUNT funcionários"
echo ""

# 3. Criar mapeamentos
echo "🔗 Criando mapeamentos..."
echo ""

# Processar cada usuário EdApp
echo "$EDAPP_USERS" | jq -c '.items[]' | while read -r user; do
  EDAPP_ID=$(echo "$user" | jq -r '.id')
  EDAPP_EMAIL=$(echo "$user" | jq -r '.email')
  EDAPP_NAME=$(echo "$user" | jq -r '.firstName + " " + .lastName')
  EXTERNAL_ID=$(echo "$user" | jq -r '.externalId // empty')
  
  if [ -z "$EXTERNAL_ID" ] || [ "$EXTERNAL_ID" = "null" ]; then
    echo "⚠️  $EDAPP_NAME ($EDAPP_EMAIL) - sem externalId, pulando"
    continue
  fi
  
  # Buscar funcionário por codigo_anac
  FUNC_ID=$(echo "$AIRTRUST_FUNCS" | jq -r ".data[] | select(.codigo_anac == \"$EXTERNAL_ID\") | .id")
  FUNC_NAME=$(echo "$AIRTRUST_FUNCS" | jq -r ".data[] | select(.codigo_anac == \"$EXTERNAL_ID\") | .nome")
  
  if [ -z "$FUNC_ID" ]; then
    echo "⚠️  $EDAPP_NAME (CANAC: $EXTERNAL_ID) - não encontrado no AirTrust"
    continue
  fi
  
  # Verificar se mapeamento já existe
  EXISTING=$(curl -s "$API_URL/api/integracoes/edapp/usuarios" | jq -r ".data[] | select(.funcionario_id == $FUNC_ID) | .id")
  
  if [ -n "$EXISTING" ]; then
    echo "✅ $FUNC_NAME (ID: $FUNC_ID) ← já mapeado"
    continue
  fi
  
  # Criar mapeamento
  echo "🔄 Criando: $FUNC_NAME (ID: $FUNC_ID) ← $EDAPP_NAME (EdApp: $EDAPP_ID)"
  
  RESULT=$(curl -s -X POST "$API_URL/api/integracoes/edapp/usuarios" \
    -H "Content-Type: application/json" \
    -d "{
      \"funcionario_id\": $FUNC_ID,
      \"edapp_user_id\": \"$EDAPP_ID\",
      \"edapp_email\": \"$EDAPP_EMAIL\",
      \"edapp_username\": \"$EDAPP_NAME\"
    }")
  
  if echo "$RESULT" | jq -e '.success == true' > /dev/null; then
    echo "   ✅ Mapeamento criado!"
  else
    ERROR=$(echo "$RESULT" | jq -r '.error // "Erro desconhecido"')
    echo "   ❌ Erro: $ERROR"
  fi
done

echo ""
echo "📊 Verificando resultado final..."
FINAL_MAPS=$(curl -s "$API_URL/api/integracoes/edapp/usuarios")
TOTAL_MAPPED=$(echo "$FINAL_MAPS" | jq '.data | length')
echo "   Total mapeados: $TOTAL_MAPPED usuários"
echo ""
echo "🏁 Sincronização concluída!"
