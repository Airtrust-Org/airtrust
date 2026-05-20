#!/bin/bash
set -e

echo "🧪 AirTrust - Teste Completo de Endpoints Locais"
echo "=================================================="
echo ""

BASE_URL="http://localhost:8787"
PASSED=0
FAILED=0

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

test_endpoint() {
    local url=$1
    local name=$2
    
    echo -n "Testing $name... "
    
    response=$(curl -s -w "\n%{http_code}" "$url")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ PASS${NC} (HTTP $http_code)"
        PASSED=$((PASSED + 1))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC} (HTTP $http_code)"
        echo "   Response: $body"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo "🔍 Testando endpoints básicos..."
test_endpoint "$BASE_URL/api/health" "/api/health"
test_endpoint "$BASE_URL/api/version" "/api/version"
test_endpoint "$BASE_URL/api/test" "/api/test"
test_endpoint "$BASE_URL/ping" "/ping"
echo ""

echo "🔍 Testando endpoints de dados..."
test_endpoint "$BASE_URL/api/funcionarios?limit=1" "/api/funcionarios"
test_endpoint "$BASE_URL/api/empresas?limit=1" "/api/empresas"
test_endpoint "$BASE_URL/api/funcoes?limit=1" "/api/funcoes"
echo ""

echo "=================================================="
echo ""
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎉 TODOS OS TESTES PASSARAM!"
    exit 0
else
    echo "⚠️  Alguns testes falharam."
    echo ""
    echo "💡 Diagnóstico:"
    echo "   - Worker está rodando? (lsof -i:8787)"
    echo "   - Rotas foram carregadas? (ver logs)"
    echo "   - Código está atualizado? (npm install)"
    exit 1
fi
