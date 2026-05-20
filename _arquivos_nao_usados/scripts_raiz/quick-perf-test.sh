#!/bin/bash

BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  ⚡ TESTE RÁPIDO DE PERFORMANCE                           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Health
echo "1️⃣  Health Check:"
curl -s -w "⏱️  Tempo: %{time_total}s | Status: %{http_code}\n" "$BASE_URL/health" | jq '.db' 2>/dev/null || echo "erro"
echo ""

# Funcionários
echo "2️⃣  Funcionários:"
curl -s -w "⏱️  Tempo: %{time_total}s | Status: %{http_code}\n" "$BASE_URL/api/v2/funcionarios" | jq '.data | length' 2>/dev/null || echo "erro"
echo ""

# Qualificações
echo "3️⃣  Qualificações:"
curl -s -w "⏱️  Tempo: %{time_total}s | Status: %{http_code}\n" "$BASE_URL/api/v2/qualificacoes" | jq '.data | length' 2>/dev/null || echo "erro"
echo ""

# Habilitações
echo "4️⃣  Habilitações:"
curl -s -w "⏱️  Tempo: %{time_total}s | Status: %{http_code}\n" "$BASE_URL/api/v2/habilitacoes" | jq '.data | length' 2>/dev/null || echo "erro"
echo ""

# Manobras
echo "5️⃣  Manobras:"
curl -s -w "⏱️  Tempo: %{time_total}s | Status: %{http_code}\n" "$BASE_URL/api/v2/manobras" | jq '.data | length' 2>/dev/null || echo "erro"
echo ""

# Templates
echo "6️⃣  Templates:"
curl -s -w "⏱️  Tempo: %{time_total}s | Status: %{http_code}\n" "$BASE_URL/api/v2/simuladores-consolidado/templates" | jq '.data | length' 2>/dev/null || echo "erro"
echo ""

echo "✅ Teste concluído!"
