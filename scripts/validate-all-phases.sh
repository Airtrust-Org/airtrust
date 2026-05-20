#!/bin/bash

set -e

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🧪 VALIDAÇÃO COMPLETA - TODAS AS FASES"
echo "======================================"
echo ""

# Configurações
API_URL="${API_URL:-https://airtrust-api-production.airtrust.workers.dev}"
TOKEN="${API_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Erro: Defina API_TOKEN como variável de ambiente${NC}"
  exit 1
fi

# Contadores
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Função para testar endpoint
test_endpoint() {
  local name=$1
  local method=$2
  local url=$3
  local expected_status=$4
  local extra_check=$5

  TOTAL_TESTS=$((TOTAL_TESTS + 1))
  echo -n "  Testing $name... "
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" \
      -H "Authorization: Bearer $TOKEN" \
      "$API_URL$url")
  elif [ "$method" = "POST" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      "$API_URL$url")
  fi
  
  status=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [ "$status" -eq "$expected_status" ]; then
    if [ -n "$extra_check" ]; then
      if echo "$body" | grep -q "$extra_check"; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $status, contains '$extra_check')"
        PASSED_TESTS=$((PASSED_TESTS + 1))
      else
        echo -e "${RED}✗ FAIL${NC} (HTTP $status, missing '$extra_check')"
        FAILED_TESTS=$((FAILED_TESTS + 1))
      fi
    else
      echo -e "${GREEN}✓ PASS${NC} (HTTP $status)"
      PASSED_TESTS=$((PASSED_TESTS + 1))
    fi
  else
    echo -e "${RED}✗ FAIL${NC} (Expected $expected_status, got $status)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
  fi
}

# FASE 1 & 2: Schema e Tipos
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📋 FASE 1 & 2: Schema e Tipos${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
test_endpoint "GET /tipos" "GET" "/api/qualificacoes/tipos" 200 "vencimento_fim_mes"
test_endpoint "GET /tipos/CMA" "GET" "/api/qualificacoes/tipos/CMA" 200 "vencimento_fim_mes"
echo ""

# FASE 3: Backend Endpoints
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📋 FASE 3: Backend Endpoints${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
test_endpoint "GET /historico" "GET" "/api/qualificacoes/historico" 200 "data"
test_endpoint "GET /alertas" "GET" "/api/qualificacoes/alertas" 200 "data"
test_endpoint "GET /alertas/resumo" "GET" "/api/qualificacoes/alertas/resumo" 200 "total"
test_endpoint "GET /alertas?urgencia=high" "GET" "/api/qualificacoes/alertas?urgencia=high" 200 ""
echo ""

# FASE 5: Notificações
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📋 FASE 5: Sistema de Notificações${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
test_endpoint "GET /notificacoes/config" "GET" "/api/notificacoes/config" 200 "tipo"
test_endpoint "GET /notificacoes/log" "GET" "/api/notificacoes/log" 200 "data"
test_endpoint "POST /notificacoes/processar" "POST" "/api/notificacoes/processar" 200 "success"
echo ""

# Teste de Cálculo de Vencimento
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📋 VALIDAÇÃO: Cálculo de Vencimento${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo -n "  CMA vence no fim do mês... "

# Criar qualificação de teste
response=$(curl -s -X POST "$API_URL/api/qualificacoes/historico" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "funcionario_cpf": "01234567890",
    "qualificacao_codigo": "CMA",
    "data_conclusao": "2024-01-15",
    "nota": 5.0,
    "instrutor": "Teste Automatico"
  }')

vencimento=$(echo "$response" | jq -r '.data.data_vencimento' 2>/dev/null)

if [[ "$vencimento" == *"-31" ]]; then
  echo -e "${GREEN}✓ PASS${NC} (vencimento: $vencimento - fim do mês correto)"
  PASSED_TESTS=$((PASSED_TESTS + 1))
else
  echo -e "${RED}✗ FAIL${NC} (vencimento: $vencimento - deveria terminar em 31)"
  FAILED_TESTS=$((FAILED_TESTS + 1))
fi

echo ""

# Resumo Final
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📊 RESUMO FINAL${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Total de testes: ${TOTAL_TESTS}"
echo -e "${GREEN}Testes passados: ${PASSED_TESTS}${NC}"
echo -e "${RED}Testes falhados: ${FAILED_TESTS}${NC}"
echo ""

# Taxa de sucesso
SUCCESS_RATE=$(echo "scale=2; ($PASSED_TESTS / $TOTAL_TESTS) * 100" | bc)
echo -e "Taxa de sucesso: ${SUCCESS_RATE}%"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
  echo -e "${GREEN}✅ TODOS OS TESTES PASSARAM!${NC}"
  echo -e "${GREEN}Sistema aprovado para produção! 🎉${NC}"
  exit 0
else
  echo -e "${RED}❌ ALGUNS TESTES FALHARAM${NC}"
  echo -e "${YELLOW}Revise os erros acima antes de aprovar para produção.${NC}"
  exit 1
fi
