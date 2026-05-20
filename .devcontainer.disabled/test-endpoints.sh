#!/bin/bash
# Script de teste DENTRO do Dev Container
set -e

echo "🧪 AirTrust - Validação Completa de Endpoints"
echo "=============================================="
echo ""
echo "⏳ Aguardando servidor iniciar..."
sleep 3

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

test_endpoint() {
    local url=$1
    local name=$2
    local expected_key=$3
    
    echo -n "Testing $name... "
    
    response=$(curl -s -w "\n%{http_code}" "$url")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)
    
    if [ "$http_code" = "200" ]; then
        if echo "$body" | jq -e ".$expected_key" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ PASS${NC} (HTTP $http_code, has '$expected_key')"
            PASSED=$((PASSED + 1))
            return 0
        else
            echo -e "${YELLOW}⚠️  WARN${NC} (HTTP $http_code, missing '$expected_key')"
            echo "   Response: $body"
            FAILED=$((FAILED + 1))
            return 1
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (HTTP $http_code)"
        echo "   Response: $body"
        FAILED=$((FAILED + 1))
        return 1
    fi
}

echo "🔍 Testando endpoints básicos..."
test_endpoint "http://localhost:8787/api/health" "/api/health" "success"
test_endpoint "http://localhost:8787/api/version" "/api/version" "success"
test_endpoint "http://localhost:8787/api/test" "/api/test" "success"
test_endpoint "http://localhost:8787/ping" "/ping" "message"
echo ""

echo "🔍 Testando endpoints de dados..."
test_endpoint "http://localhost:8787/api/funcionarios?limit=5" "/api/funcionarios" "success"
test_endpoint "http://localhost:8787/api/empresas?limit=5" "/api/empresas" "success"
test_endpoint "http://localhost:8787/api/funcoes?limit=5" "/api/funcoes" "success"
test_endpoint "http://localhost:8787/api/setores?limit=5" "/api/setores" "success"
echo ""

echo "🔍 Testando endpoints de módulos..."
test_endpoint "http://localhost:8787/api/qualificacoes?limit=5" "/api/qualificacoes" "success"
test_endpoint "http://localhost:8787/api/sessoes?limit=5" "/api/sessoes" "success"
test_endpoint "http://localhost:8787/api/manobras?limit=5" "/api/manobras" "success"
echo ""

echo "=============================================="
echo ""
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎉 TODOS OS TESTES PASSARAM!"
    echo ""
    echo "✨ Sistema pronto para desenvolvimento!"
    exit 0
else
    echo "⚠️  Alguns testes falharam. Verifique os logs acima."
    exit 1
fi
