#!/bin/bash

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   🧪 TESTES END-TO-END AIRTRUST - VALIDAÇÃO COMPLETA    ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

BASE_URL="${1:-http://localhost:8787}"
PASS=0
FAIL=0

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    
    echo -n "Testing: $name... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint" 2>/dev/null)
    fi
    
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        PASS=$((PASS + 1))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code)"
        if [ -n "$body" ]; then
            echo "  Response: $(echo "$body" | head -c 100)"
        fi
        FAIL=$((FAIL + 1))
        return 1
    fi
}

echo "═══════════════════════════════════════════════════════════"
echo "1. Testando Health Check"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Health check" "GET" "/health"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "2. Testando Funcionários"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar funcionários" "GET" "/api/v2/funcionarios"
test_endpoint "Listar instrutores" "GET" "/api/v2/funcionarios/instrutores"
test_endpoint "Listar examinadores" "GET" "/api/v2/funcionarios/examinadores"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "3. Testando Simuladores"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar simuladores" "GET" "/api/v2/simuladores"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "4. Testando Qualificações"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar qualificações" "GET" "/api/v2/qualificacoes"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "5. Testando Fichas de Avaliação"
echo "═══════════════════════════════════════════════════════════"

# Nota: Este teste pode falhar se não houver fichas no banco
test_endpoint "Endpoint fichas existe" "GET" "/api/v2/fichas/test-uuid" || echo -e "${YELLOW}  (Esperado: UUID não existe)${NC}"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "6. Testando Manobras"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar manobras" "GET" "/api/v2/simuladores/manobras"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "7. Testando Agendamentos"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar agendamentos" "GET" "/api/v2/agendamentos"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "8. Testando Dashboard"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Dashboard stats" "GET" "/api/v2/dashboard-stats"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📊 RESUMO DOS TESTES"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo -e "${GREEN}✓ PASSOU: $PASS${NC}"
echo -e "${RED}✗ FALHOU: $FAIL${NC}"
echo ""

TOTAL=$((PASS + FAIL))
if [ $TOTAL -gt 0 ]; then
    PERCENTAGE=$((PASS * 100 / TOTAL))
    echo "Taxa de sucesso: $PERCENTAGE%"
fi

echo ""
if [ $FAIL -eq 0 ]; then
    echo "🎉 TODOS OS TESTES PASSARAM!"
    exit 0
else
    echo "❌ ALGUNS TESTES FALHARAM"
    exit 1
fi
