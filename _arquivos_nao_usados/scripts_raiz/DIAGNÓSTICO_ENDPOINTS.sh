#!/bin/bash

echo "🧪 DIAGNÓSTICO ENDPOINTS MASTER DATA"
echo "===================================="
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

API_URL="https://api.airtrust.dev/api/v2"

echo "📍 Base URL: $API_URL"
echo ""

# 1. Categorias
echo "1️⃣ GET /categorias"
curl -s "$API_URL/categorias?limit=3" | jq '{status: .success, total: .total, count: (.data | length), first: .data[0]}'
echo ""

# 2. Qualificações
echo "2️⃣ GET /qualificacoes"
curl -s "$API_URL/qualificacoes?limit=3" | jq '{status: .success, total: .total, count: (.data | length)}'
echo ""

# 3. Qualificações Lista
echo "3️⃣ GET /qualificacoes-list"
curl -s "$API_URL/qualificacoes-list?limit=3" | jq '{status: .success, total: .total, count: (.data | length)}'
echo ""

# 4. Histórico
echo "4️⃣ GET /historico"
curl -s "$API_URL/historico?limit=3" | jq '{status: .success, total: .total, count: (.data | length)}'
echo ""

echo "===================================="
