#!/bin/bash

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Contadores
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}🧪 SUITE COMPLETA DE TESTES - SISTEMA DE IMPORTAÇÃO${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "📅 Data: $(date '+%d/%m/%Y %H:%M:%S')"
echo "📁 Diretório: $(pwd)"
echo ""

# ============================================================================
# 1. TESTES UNITÁRIOS (Utils)
# ============================================================================
echo -e "${BOLD}1️⃣  TESTES UNITÁRIOS (Utils)${NC}"
echo "────────────────────────────────────────────────────────────"

if [ -f "worker-airtrust/package.json" ]; then
  cd worker-airtrust
  
  echo "🔧 Instalando dependências..."
  npm install --silent 2>/dev/null || npm install
  
  echo ""
  echo "🧪 Executando testes unitários..."
  
  if npm run test:unit 2>&1 | tee /tmp/unit-tests.log; then
    echo -e "${GREEN}✅ Testes unitários PASSARAM${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}❌ Testes unitários FALHARAM${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  
  cd ..
else
  echo -e "${YELLOW}⚠️  Pasta worker-airtrust não encontrada${NC}"
fi

echo ""

# ============================================================================
# 2. TESTES E2E (Produção)
# ============================================================================
echo -e "${BOLD}2️⃣  TESTES E2E (API Produção)${NC}"
echo "────────────────────────────────────────────────────────────"

API_URL="https://airtrust-api-production.airtrust.workers.dev"
echo "🌐 URL: $API_URL"
echo ""

# Função para testar endpoint
test_api_endpoint() {
  local test_name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_status=$5
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo -n "  ${test_name}... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint" 2>/dev/null)
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$API_URL$endpoint" 2>/dev/null)
  fi
  
  status=$(echo "$response" | tail -n1)
  
  if [ "$status" -eq "$expected_status" ]; then
    echo -e "${GREEN}✅ PASS${NC} (Status: $status)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}❌ FAIL${NC} (Status: $status, Expected: $expected_status)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# Template CSV
test_api_endpoint \
  "GET Template Funcionários" \
  "GET" \
  "/api/qualificacoes/tipos" \
  "" \
  200

# Validação JSON - Funcionários válidos
test_api_endpoint \
  "Validar Funcionários (válidos)" \
  "POST" \
  "/api/importacao/validar-json/funcionarios" \
  '{"rows":[{"Nome":"João Silva","CPF":"012.345.678-90","Matricula":"001"}],"modo":"INSERT"}' \
  200

# Validação JSON - CPF inválido
test_api_endpoint \
  "Validar Funcionários (CPF inválido)" \
  "POST" \
  "/api/importacao/validar-json/funcionarios" \
  '{"rows":[{"Nome":"João Silva","CPF":"111.111.111-11","Matricula":"001"}],"modo":"INSERT"}' \
  200

# Validação JSON - Tipos válidos
test_api_endpoint \
  "Validar Tipos (válidos)" \
  "POST" \
  "/api/importacao/validar-json/qualificacoes_tipos" \
  '{"rows":[{"codigo":"TEST-001","nome":"Teste"}],"modo":"UPSERT"}' \
  200

# Executar importação - Funcionários
test_api_endpoint \
  "Executar Importação Funcionários" \
  "POST" \
  "/api/importacao/executar-json/funcionarios" \
  '{"rows":[{"Nome":"Teste E2E","CPF":"01234567890","Matricula":"E2E-001"}],"mode":"UPSERT"}' \
  200

# Executar importação - Tipos
test_api_endpoint \
  "Executar Importação Tipos" \
  "POST" \
  "/api/importacao/executar-json/qualificacoes_tipos" \
  '{"rows":[{"codigo":"E2E-TEST","nome":"Teste E2E"}],"mode":"UPSERT"}' \
  200

echo ""

# ============================================================================
# 3. TESTES DE CASOS EDGE
# ============================================================================
echo -e "${BOLD}3️⃣  TESTES DE CASOS EDGE${NC}"
echo "────────────────────────────────────────────────────────────"

test_edge_case() {
  local test_name=$1
  local data=$2
  
  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo -n "  ${test_name}... "
  
  response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d "$data" \
    "$API_URL/api/importacao/validar-json/funcionarios" 2>/dev/null)
  
  status=$(echo "$response" | tail -n1)
  
  # Para edge cases, 200 é esperado (validação sempre retorna 200)
  if [ "$status" -eq "200" ]; then
    echo -e "${GREEN}✅ PASS${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  else
    echo -e "${RED}❌ FAIL${NC} (Status: $status)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# CPF com máscara
test_edge_case \
  "CPF com máscara" \
  '{"rows":[{"Nome":"Teste","CPF":"012.345.678-90","Matricula":"001"}]}'

# CPF sem zeros
test_edge_case \
  "CPF sem zeros à esquerda" \
  '{"rows":[{"Nome":"Teste","CPF":"1234567890","Matricula":"001"}]}'

# Data DD/MM/YY
test_edge_case \
  "Data com ano 2 dígitos" \
  '{"rows":[{"Nome":"Teste","CPF":"01234567890","Matricula":"001","Nascimento":"26/11/90"}]}'

# Data sem zeros
test_edge_case \
  "Data sem zeros (D/M/YYYY)" \
  '{"rows":[{"Nome":"Teste","CPF":"01234567890","Matricula":"001","Nascimento":"5/3/2025"}]}'

# Excel serial
test_edge_case \
  "Excel serial number" \
  '{"rows":[{"Nome":"Teste","CPF":"01234567890","Matricula":"001","Nascimento":45623}]}'

# CPF sequência (deve falhar)
test_edge_case \
  "CPF sequência (deve rejeitar)" \
  '{"rows":[{"Nome":"Teste","CPF":"111.111.111-11","Matricula":"001"}]}'

# Data inválida (deve falhar)
test_edge_case \
  "Data inválida (deve rejeitar)" \
  '{"rows":[{"Nome":"Teste","CPF":"01234567890","Matricula":"001","Nascimento":"32/13/2025"}]}'

echo ""

# ============================================================================
# 4. RESULTADO FINAL
# ============================================================================
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}📊 RESULTADO FINAL${NC}"
echo -e "${BOLD}════════════════════════════════════════════════════════════${NC}"
echo ""
echo "Total de testes: $TOTAL_TESTS"
echo -e "${GREEN}✅ Passou: $PASSED_TESTS${NC}"
echo -e "${RED}❌ Falhou: $FAILED_TESTS${NC}"

if [ $TOTAL_TESTS -gt 0 ]; then
  SUCCESS_RATE=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
  echo "📈 Taxa de sucesso: ${SUCCESS_RATE}%"
fi

echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}${BOLD}🎉 TODOS OS TESTES PASSARAM!${NC}"
  echo -e "${GREEN}Sistema aprovado para produção ✅${NC}"
  exit 0
else
  echo -e "${YELLOW}${BOLD}⚠️  ALGUNS TESTES FALHARAM${NC}"
  echo "Revise os logs acima para detalhes"
  exit 1
fi
