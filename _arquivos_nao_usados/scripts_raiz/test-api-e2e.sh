#!/bin/bash

# TESTE E2E - API Endpoints de Importação
# Testa todos os endpoints críticos em produção

API_URL="https://airtrust-api-production.airtrust.workers.dev"

echo "================================================"
echo "TESTE E2E - API de Importação"
echo "================================================"
echo ""
echo "URL da API: $API_URL"
echo ""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contador de testes
TOTAL=0
PASSED=0
FAILED=0

# Helper: Testar endpoint
test_endpoint() {
  local method=$1
  local endpoint=$2
  local description=$3
  local expected_status=$4
  local data=$5
  
  TOTAL=$((TOTAL + 1))
  echo "----------------------------------------"
  echo "Teste $TOTAL: $description"
  echo "  Método: $method"
  echo "  Endpoint: $endpoint"
  
  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint")
  elif [ "$method" = "POST" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST "$API_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  elif [ "$method" = "DELETE" ]; then
    response=$(curl -s -w "\n%{http_code}" -X DELETE "$API_URL$endpoint")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  echo "  Status: $http_code (esperado: $expected_status)"
  
  if [ "$http_code" -eq "$expected_status" ]; then
    echo -e "  ${GREEN}✅ PASSOU${NC}"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}❌ FALHOU${NC}"
    echo "  Response body:"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    FAILED=$((FAILED + 1))
  fi
  echo ""
}

echo "================================================"
echo "1. TESTES DE FUNCIONÁRIOS"
echo "================================================"
echo ""

# GET /funcionarios (listar)
test_endpoint "GET" "/api/funcionarios" "Listar funcionários" 200

# POST /funcionarios (criar)
test_endpoint "POST" "/api/funcionarios" "Criar funcionário teste" 201 '{
  "cpf": "12345678909",
  "nome": "TESTE API E2E",
  "matricula": "E2E-TEST-001",
  "guerra": "TESTE",
  "nascimento": "1990-01-01",
  "admissao": "2020-01-01"
}'

echo "================================================"
echo "2. TESTES DE QUALIFICAÇÕES TIPOS"
echo "================================================"
echo ""

# GET /qualificacoes/tipos
test_endpoint "GET" "/api/qualificacoes/tipos" "Listar tipos de qualificação" 200

# POST /qualificacoes/tipos (criar)
test_endpoint "POST" "/api/qualificacoes/tipos" "Criar tipo de qualificação teste" 201 '{
  "codigo": "E2E-TEST-001",
  "nome": "Teste E2E Tipo",
  "validade": 12,
  "carga_horaria": 40
}'

# DELETE /qualificacoes/tipos/:codigo (soft delete)
test_endpoint "DELETE" "/api/qualificacoes/tipos/E2E-TEST-001" "Deletar tipo de qualificação (soft delete)" 200

echo "================================================"
echo "3. TESTES DE IMPORTAÇÃO - VALIDAÇÃO"
echo "================================================"
echo ""

# Validar JSON de funcionários (dados válidos)
test_endpoint "POST" "/api/importacao/validar-json/funcionarios" "Validar JSON funcionários (válidos)" 200 '{
  "rows": [
    {
      "CPF": "012.345.678-90",
      "Nome": "TESTE VALIDACAO",
      "Matricula": "VAL-001",
      "Nascimento": "26/11/1990",
      "Admissao": "15/01/2020"
    }
  ],
  "modo": "MESCLAR_INTELIGENTE"
}'

# Validar JSON de funcionários (CPF inválido)
test_endpoint "POST" "/api/importacao/validar-json/funcionarios" "Validar JSON funcionários (CPF inválido)" 200 '{
  "rows": [
    {
      "CPF": "00000000000",
      "Nome": "TESTE INVALIDO",
      "Matricula": "INV-001",
      "Nascimento": "26/11/1990",
      "Admissao": "15/01/2020"
    }
  ],
  "modo": "INSERT"
}'

# Validar JSON de tipos (dados válidos)
test_endpoint "POST" "/api/importacao/validar-json/qualificacoes_tipos" "Validar JSON tipos (válidos)" 200 '{
  "rows": [
    {
      "codigo": "VAL-TIPO-001",
      "nome": "Teste Validação Tipo",
      "validade": 12,
      "carga_horaria": 40
    }
  ],
  "modo": "UPSERT"
}'

echo "================================================"
echo "4. TESTES DE IMPORTAÇÃO - EXECUÇÃO"
echo "================================================"
echo ""

# Executar importação de funcionários
test_endpoint "POST" "/api/importacao/executar-json/funcionarios" "Executar importação funcionários" 200 '{
  "rows": [
    {
      "CPF": "12345678909",
      "Nome": "TESTE IMPORTACAO EXEC",
      "Matricula": "EXEC-001",
      "Nascimento": "1985-05-15",
      "Admissao": "2021-03-20"
    }
  ],
  "mode": "UPSERT"
}'

# Executar importação de tipos
test_endpoint "POST" "/api/importacao/executar-json/qualificacoes_tipos" "Executar importação tipos" 200 '{
  "rows": [
    {
      "codigo": "EXEC-TIPO-001",
      "nome": "Teste Execução Tipo",
      "validade": 24,
      "carga_horaria": 80
    }
  ],
  "mode": "UPSERT"
}'

echo "================================================"
echo "5. TESTES DE DELETE ENDPOINTS"
echo "================================================"
echo ""

# DELETE funcionário (testar se endpoint existe e responde)
# Nota: Pode retornar 404 se não existir, mas não deve retornar 404 "endpoint not found"
test_endpoint "DELETE" "/api/funcionarios/12345678909" "DELETE funcionário (endpoint deve existir)" 200

# DELETE histórico (testar se endpoint existe)
# Criar um histórico primeiro
test_endpoint "POST" "/api/qualificacoes/historico" "Criar histórico para teste de DELETE" 201 '{
  "funcionario_cpf": "12345678909",
  "qualificacao_codigo": "EXEC-TIPO-001",
  "data_conclusao": "2024-01-15",
  "instituicao": "Instituição Teste E2E"
}'

echo "================================================"
echo "RESULTADO FINAL"
echo "================================================"
echo ""
echo "Total de testes: $TOTAL"
echo -e "${GREEN}✅ Passaram: $PASSED${NC}"
echo -e "${RED}❌ Falharam: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}🎉 TODOS OS TESTES PASSARAM! API funcionando corretamente.${NC}"
  exit 0
else
  PERCENT=$(echo "scale=1; $PASSED * 100 / $TOTAL" | bc)
  echo -e "${YELLOW}⚠️  Taxa de sucesso: ${PERCENT}%${NC}"
  exit 1
fi
