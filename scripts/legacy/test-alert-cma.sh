#!/bin/bash
set -euo pipefail

echo "🧪 Teste completo do sistema de alertas CMA/EAD"
echo ""

# Pegar token
TOKEN=$(cat .env.local | grep VITE_API_TOKEN | cut -d= -f2)

# 1. Buscar qualificação CMA vencendo
echo "1️⃣ Buscando qualificação CMA/EXAME vencendo..."
QUALIFICACAO=$(curl -s "https://api.airtrust.online/api/qualificacoes/historico" \
  -H "Authorization: Bearer $TOKEN" | \
  jq -r '.data[] | select(.status == "VENCENDO_30" and (.qualificacao_categoria == "EXAME" or .qualificacao_categoria == "CMA")) | {id, funcionario_nome, qualificacao_nome, categoria: .qualificacao_categoria, data_vencimento, status} | @json' | head -1)

if [ -z "$QUALIFICACAO" ]; then
  echo "❌ Nenhuma qualificação CMA/EXAME vencendo encontrada"
  exit 1
fi

ID=$(echo $QUALIFICACAO | jq -r '.id')
NOME=$(echo $QUALIFICACAO | jq -r '.funcionario_nome')
QUAL=$(echo $QUALIFICACAO | jq -r '.qualificacao_nome')

echo "✅ Encontrada:"
echo "   ID: $ID"
echo "   Funcionário: $NOME"
echo "   Qualificação: $QUAL"
echo ""

# 2. Testar envio de alerta
echo "2️⃣ Testando envio de alerta..."
RESPONSE=$(curl -s -w "\n%{http_code}" "https://api.airtrust.online/api/alertas/ead-vencido/$ID" \
  -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mensagem": "Teste de alerta via script",
    "enviarEmail": true,
    "enviarWhatsApp": true
  }')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -1)

echo "📡 HTTP Status: $HTTP_CODE"
echo "📄 Response:"
echo "$BODY" | jq '.'

if [ "$HTTP_CODE" == "200" ]; then
  echo ""
  echo "✅ SUCESSO! Alerta enviado corretamente"
  echo ""
  echo "📊 Resumo:"
  echo "$BODY" | jq '.data | {funcionario, qualificacao, statusVencimento, canais: (.alertas | length)}'
else
  echo ""
  echo "❌ ERRO ao enviar alerta"
  if echo "$BODY" | jq -e '.detalhes' > /dev/null 2>&1; then
    echo ""
    echo "🔍 Detalhes do erro:"
    echo "$BODY" | jq -r '.detalhes[]' | sed 's/^/   - /'
  fi
  exit 1
fi
