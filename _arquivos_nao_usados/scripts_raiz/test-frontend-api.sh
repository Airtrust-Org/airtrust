#!/bin/bash

echo "�� TESTANDO COMUNICAÇÃO FRONTEND <-> API"
echo "=========================================="
echo ""

# Aguardar propagação de DNS
echo "⏳ Aguardando 5 segundos para propagação..."
sleep 5

# Test 1: Verificar se a página está carregando
echo "1️⃣ Testando carregamento da página..."
RESPONSE=$(curl -s -w "\n%{http_code}" https://main.airtrust.pages.dev)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "200" ]; then
  echo "   ✅ Página carregando (HTTP $HTTP_CODE)"
else
  echo "   ❌ Erro na página (HTTP $HTTP_CODE)"
fi

echo ""

# Test 2: Verificar se API está respondendo
echo "2️⃣ Testando API de Manobras..."
API_RESPONSE=$(curl -s -H "Accept: application/json" \
  "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/manobras")
MANOBRAS_COUNT=$(echo "$API_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
if [ "$MANOBRAS_COUNT" -gt 0 ]; then
  echo "   ✅ API respondendo com $MANOBRAS_COUNT manobras"
else
  echo "   ❌ API não respondendo ou sem dados"
fi

echo ""

# Test 3: Verificar CORS
echo "3️⃣ Testando Headers de CORS..."
CORS_HEADER=$(curl -s -I \
  "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/manobras" | \
  grep -i "Access-Control-Allow-Origin" || echo "NOT_FOUND")
if [ "$CORS_HEADER" != "NOT_FOUND" ]; then
  echo "   ✅ CORS Headers presentes"
  echo "      $CORS_HEADER"
else
  echo "   ⚠️  Sem CORS headers (verifique configuração)"
fi

echo ""
echo "=========================================="
echo "✅ Testes Concluídos"
