#!/bin/bash
set -euo pipefail

echo "🧪 Teste de Alerta - Verificação Completa"
echo ""

# Pegar uma qualificação VENCENDO ou VENCIDA de EAD/CMA
echo "1. Buscando qualificações EAD/CMA vencendo..."

TOKEN=$(grep VITE_API_TOKEN .env.local | cut -d= -f2 | tr -d '"' | xargs)

# Usar localhost se disponível, senão workers.dev
API_BASE="http://localhost:8787/api"
if ! curl -s "$API_BASE/health" >/dev/null 2>&1; then
  API_BASE="https://airtrust-api-production.airtrust.workers.dev/api"
  echo "   Usando API: $API_BASE"
fi

# Buscar EAD vencendo
RESPONSE=$(curl -s "$API_BASE/qualificacoes/historico?limit=200" \
  -H "Authorization: Bearer $TOKEN")

# Extrair primeira qualificação EAD vencendo
ID=$(echo "$RESPONSE" | jq -r '.data[] | select(.status == "VENCENDO_30" or .status == "VENCIDA") | select(.qualificacao_categoria == "EAD" or .qualificacao_categoria == "EXAME" or .qualificacao_categoria == "CMA") | .id' | head -1)

if [ -z "$ID" ]; then
  echo "❌ Nenhuma qualificação EAD/CMA vencendo encontrada"
  echo ""
  echo "📊 Vamos mostrar as primeiras qualificações disponíveis:"
  echo "$RESPONSE" | jq -r '.data[0:3] | .[] | "   ID: \(.id) - \(.funcionario_nome) - \(.qualificacao_nome) - Status: \(.status)"'
  exit 1
fi

# Buscar detalhes dessa qualificação
QUAL=$(echo "$RESPONSE" | jq -r ".data[] | select(.id == $ID)")

NOME=$(echo "$QUAL" | jq -r '.funcionario_nome')
TIPO=$(echo "$QUAL" | jq -r '.qualificacao_nome')
STATUS=$(echo "$QUAL" | jq -r '.status')
CATEGORIA=$(echo "$QUAL" | jq -r '.qualificacao_categoria')

echo "✅ Qualificação encontrada:"
echo "   ID: $ID"
echo "   Funcionário: $NOME"
echo "   Tipo: $TIPO"
echo "   Categoria: $CATEGORIA"
echo "   Status: $STATUS"
echo ""

# Enviar alerta
echo "2. Enviando alerta..."
ALERT_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$API_BASE/alertas/ead-vencido/$ID" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mensagem": "Teste de alerta via script",
    "enviarEmail": true,
    "enviarWhatsApp": true
  }')

HTTP_CODE=$(echo "$ALERT_RESPONSE" | grep "HTTP_CODE:" | cut -d: -f2)
BODY=$(echo "$ALERT_RESPONSE" | sed '/HTTP_CODE:/d')

echo "   HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" == "200" ]; then
  echo "✅ SUCESSO! Alerta enviado"
  echo ""
  echo "📊 Resposta:"
  echo "$BODY" | jq '.'
else
  echo "❌ ERRO ao enviar alerta"
  echo ""
  echo "📄 Resposta:"
  echo "$BODY" | jq '.'
  echo ""
  if echo "$BODY" | jq -e '.detalhes' > /dev/null 2>&1; then
    echo "🔍 Detalhes do erro:"
    echo "$BODY" | jq -r '.detalhes[]' | sed 's/^/   ❌ /'
  fi
  exit 1
fi
