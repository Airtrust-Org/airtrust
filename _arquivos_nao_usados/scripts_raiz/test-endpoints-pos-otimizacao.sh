#!/bin/bash

# Teste completo de endpoints após otimização
# Data: 2025-11-20

echo "🧪 TESTE COMPLETO DE ENDPOINTS - PÓS OTIMIZAÇÃO"
echo "================================================"
echo ""

API_BASE="http://localhost:8787/api"
TOTAL=0
PASSED=0
FAILED=0

test_endpoint() {
  local name="$1"
  local url="$2"
  local expected="$3"
  
  TOTAL=$((TOTAL + 1))
  echo -n "[$TOTAL] $name... "
  
  response=$(curl -s "$url")
  success=$(echo "$response" | jq -r '.success' 2>/dev/null)
  
  if [ "$success" == "$expected" ]; then
    echo "✅ OK"
    PASSED=$((PASSED + 1))
  else
    echo "❌ FAIL"
    FAILED=$((FAILED + 1))
    echo "   Response: $response" | head -c 200
    echo ""
  fi
}

# Endpoints principais
test_endpoint "GET /simuladores/sessoes" "$API_BASE/simuladores/sessoes?limit=5" "true"
test_endpoint "GET /simuladores/fichas" "$API_BASE/simuladores/fichas?limit=5" "true"
test_endpoint "GET /simuladores/templates" "$API_BASE/simuladores/templates" "true"
test_endpoint "GET /simuladores/manobras" "$API_BASE/simuladores/manobras?limit=5" "true"
test_endpoint "GET /funcionarios" "$API_BASE/funcionarios?limit=5" "true"
test_endpoint "GET /qualificacoes/tipos" "$API_BASE/qualificacoes/tipos" "true"
test_endpoint "GET /qualificacoes/historico" "$API_BASE/qualificacoes/historico?limit=5" "true"

echo ""
echo "================================================"
echo "📊 RESULTADO FINAL"
echo "================================================"
echo "Total: $TOTAL"
echo "Passou: $PASSED ($(echo "scale=1; $PASSED * 100 / $TOTAL" | bc)%)"
echo "Falhou: $FAILED ($(echo "scale=1; $FAILED * 100 / $TOTAL" | bc)%)"
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ TODOS OS TESTES PASSARAM!"
  exit 0
else
  echo "⚠️  Alguns testes falharam"
  exit 1
fi
