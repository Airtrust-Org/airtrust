#!/bin/bash
# Script de teste de integração para agendamentos

API_URL="${API_URL:-https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev}"

echo "🧪 Iniciando testes de integração - Agendamentos"
echo "API URL: $API_URL"
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Contadores
TOTAL=0
PASSED=0
FAILED=0

# Função de teste
test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_status=$5

  TOTAL=$((TOTAL + 1))
  echo -n "  Testing: $name... "

  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$API_URL$endpoint")
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | head -n-1)

  if [ "$http_code" = "$expected_status" ]; then
    echo -e "${GREEN}✓ PASS${NC}"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $http_code)"
    echo "Response: $body"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}1️⃣  Testando busca de funcionários${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
test_endpoint "Search by name" "GET" "/api/v2/funcionarios/search/search?q=Silva" "" "200"
test_endpoint "Search by matricula" "GET" "/api/v2/funcionarios/search/search?q=1234" "" "200"
test_endpoint "Empty search" "GET" "/api/v2/funcionarios/search/search?q=" "" "200"
test_endpoint "Search with limit" "GET" "/api/v2/funcionarios/search/search?q=a&limit=5" "" "200"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}2️⃣  Testando qualificações de funcionário${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
test_endpoint "Get qualificacoes funcionario 1" "GET" "/api/v2/funcionarios/search/1/qualificacoes" "" "200"
test_endpoint "Get compliance funcionario 1" "GET" "/api/v2/funcionarios/search/1/compliance" "" "200"
test_endpoint "Invalid funcionario" "GET" "/api/v2/funcionarios/search/99999/qualificacoes" "" "200"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}3️⃣  Testando CRUD de agendamentos${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
test_endpoint "List all agendamentos" "GET" "/api/v2/agendamentos" "" "200"
test_endpoint "List by simulador" "GET" "/api/v2/agendamentos?simulador_id=1" "" "200"
test_endpoint "List by funcionario" "GET" "/api/v2/agendamentos?funcionario_id=1" "" "200"
test_endpoint "List by date range" "GET" "/api/v2/agendamentos?data_inicio=2025-10-01&data_fim=2025-10-31" "" "200"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}4️⃣  Testando disponibilidade${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
test_endpoint "Check disponibilidade" "GET" "/api/v2/agendamentos/disponibilidade?simulador_id=1&data=2025-10-25" "" "200"
test_endpoint "Missing params" "GET" "/api/v2/agendamentos/disponibilidade" "" "400"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}5️⃣  Testando criação de agendamento${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"

# Teste de criação (pode falhar se funcionário/simulador não existir)
TOMORROW=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d "+1 day" +%Y-%m-%d)
test_endpoint "Create agendamento" "POST" "/api/v2/agendamentos" '{
  "simulador_id": 1,
  "funcionario_id": 1,
  "data_agendamento": "'$TOMORROW'",
  "hora_inicio": "09:00",
  "hora_fim": "11:00",
  "tipo_sessao": "TREINAMENTO",
  "observacoes": "Teste de integração"
}' "201"

# Teste de validação - funcionário inválido
test_endpoint "Invalid funcionario_id" "POST" "/api/v2/agendamentos" '{
  "simulador_id": 1,
  "funcionario_id": 99999,
  "data_agendamento": "'$TOMORROW'",
  "hora_inicio": "14:00",
  "hora_fim": "16:00",
  "tipo_sessao": "CHECK"
}' "400"

# Teste de validação - simulador inválido
test_endpoint "Invalid simulador_id" "POST" "/api/v2/agendamentos" '{
  "simulador_id": 99999,
  "funcionario_id": 1,
  "data_agendamento": "'$TOMORROW'",
  "hora_inicio": "14:00",
  "hora_fim": "16:00",
  "tipo_sessao": "CHECK"
}' "400"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📊 Resumo dos Testes${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "Total de testes: ${BLUE}$TOTAL${NC}"
echo -e "Passou: ${GREEN}$PASSED${NC}"
echo -e "Falhou: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
  echo ""
  echo -e "${GREEN}🎉 Todos os testes passaram!${NC}"
  exit 0
else
  echo ""
  echo -e "${RED}❌ Alguns testes falharam.${NC}"
  exit 1
fi
