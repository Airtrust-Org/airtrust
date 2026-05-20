#!/bin/bash

################################################################################
# TEST SUITE COMPLETO - Qualificações Historico
# Testa: POST, GET, PUT, DELETE com validacoes, edge cases, dados persistidos
# Data: 2025-11-22
################################################################################

set -euo pipefail

# ===== CONFIGURAÇÃO =====
API_BASE="http://localhost:8787/api"
AUTH_TOKEN="${AUTH_TOKEN:-}"  # Deve ser passado via ENV ou definir aqui

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

# ===== HELPERS =====
log_header() {
  echo -e "\n${BLUE}========== $1 ==========${NC}\n"
}

log_test() {
  echo -e "${YELLOW}📝 Teste: $1${NC}"
}

log_pass() {
  echo -e "${GREEN}✅ PASSOU: $1${NC}"
  ((PASS_COUNT++))
}

log_fail() {
  echo -e "${RED}❌ FALHOU: $1${NC}"
  ((FAIL_COUNT++))
}

log_debug() {
  echo -e "${BLUE}🔍 $1${NC}"
}

# Helper para fazer requisição
call_api() {
  local method=$1
  local endpoint=$2
  local data=$3
  local expected_http=$4

  log_debug "REQUEST: $method $endpoint"
  if [ -n "$data" ]; then
    log_debug "PAYLOAD: $data"
  fi

  local response
  if [ -n "$data" ]; then
    response=$(curl -s -X "$method" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -w "\n%{http_code}" \
      -d "$data" \
      "$API_BASE$endpoint")
  else
    response=$(curl -s -X "$method" \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      -H "Content-Type: application/json" \
      -w "\n%{http_code}" \
      "$API_BASE$endpoint")
  fi

  local http_code=$(echo "$response" | tail -n 1)
  local body=$(echo "$response" | sed '$d')

  echo "$body"
  
  if [ "$http_code" != "$expected_http" ]; then
    log_debug "HTTP CODE: $http_code (esperado: $expected_http)"
    log_debug "RESPONSE BODY: $body"
  fi
}

# ===== SETUP =====
if [ -z "$AUTH_TOKEN" ]; then
  log_fail "AUTH_TOKEN não definido. Execute: export AUTH_TOKEN='seu_token_aqui'"
  exit 1
fi

log_header "SETUP INICIAL"

# Verificar se API está online
log_test "Validar disponibilidade da API"
if ! curl -s -f "$API_BASE/qualificacoes/tipos" \
  -H "Authorization: Bearer $AUTH_TOKEN" > /dev/null 2>&1; then
  log_fail "API não está disponível em $API_BASE"
  exit 1
fi
log_pass "API disponível"

# Buscar um funcionário ativo
log_test "Buscar funcionário ativo para teste"
FUNC_RESPONSE=$(curl -s -X GET \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  "$API_BASE/funcionarios?ativo=true&limit=1")

FUNCIONARIO_ID=$(echo "$FUNC_RESPONSE" | jq -r '.data[0].id // empty' 2>/dev/null || echo "")
if [ -z "$FUNCIONARIO_ID" ]; then
  log_fail "Nenhum funcionário ativo encontrado"
  exit 1
fi
log_pass "Funcionário ID: $FUNCIONARIO_ID"

# Buscar uma qualificação tipo
log_test "Buscar tipo de qualificação para teste"
QUAL_RESPONSE=$(curl -s -X GET \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  "$API_BASE/qualificacoes/tipos?limit=1")

QUALIFICACAO_ID=$(echo "$QUAL_RESPONSE" | jq -r '.data[0].id // empty' 2>/dev/null || echo "")
if [ -z "$QUALIFICACAO_ID" ]; then
  log_fail "Nenhuma qualificação tipo encontrada"
  exit 1
fi
log_pass "Qualificação Tipo ID: $QUALIFICACAO_ID"

# ===== TESTES POST =====
log_header "TESTE 1: POST /qualificacoes/historico"

log_test "Criar nova qualificação com dados válidos"
CREATE_PAYLOAD=$(cat <<EOF
{
  "funcionario_id": $FUNCIONARIO_ID,
  "qualificacao_id": $QUALIFICACAO_ID,
  "data_conclusao": "2025-11-20T10:00:00Z",
  "data_vencimento": "2026-11-20T10:00:00Z",
  "numero_certificado": "CERT-TEST-001",
  "observacoes": "Teste automatizado 2025-11-22"
}
EOF
)

POST_RESPONSE=$(call_api POST "/qualificacoes/historico" "$CREATE_PAYLOAD" "201")
QUAL_ID=$(echo "$POST_RESPONSE" | jq -r '.data.id // empty' 2>/dev/null || echo "")

if [ -n "$QUAL_ID" ] && [ "$QUAL_ID" != "null" ]; then
  log_pass "Qualificação criada com ID: $QUAL_ID"
else
  log_fail "POST retornou erro ou sem ID: $POST_RESPONSE"
  exit 1
fi

log_test "Validar erros - funcionario_id inválido (NaN/string)"
INVALID_PAYLOAD=$(cat <<EOF
{
  "funcionario_id": "invalid",
  "qualificacao_id": $QUALIFICACAO_ID,
  "data_conclusao": "2025-11-20T10:00:00Z",
  "data_vencimento": "2026-11-20T10:00:00Z"
}
EOF
)
INVALID_RESPONSE=$(call_api POST "/qualificacoes/historico" "$INVALID_PAYLOAD" "400")
if echo "$INVALID_RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  log_pass "Validação de funcionario_id funcionou"
else
  log_fail "Não rejeitou funcionario_id inválido: $INVALID_RESPONSE"
fi

log_test "Validar erros - campos obrigatórios ausentes"
MISSING_PAYLOAD=$(cat <<EOF
{
  "funcionario_id": $FUNCIONARIO_ID
}
EOF
)
MISSING_RESPONSE=$(call_api POST "/qualificacoes/historico" "$MISSING_PAYLOAD" "400")
if echo "$MISSING_RESPONSE" | jq -e '.success == false' > /dev/null 2>&1; then
  log_pass "Validação de campos obrigatórios funcionou"
else
  log_fail "Não rejeitou payload incompleto: $MISSING_RESPONSE"
fi

# ===== TESTES GET =====
log_header "TESTE 2: GET /qualificacoes/historico/:id"

log_test "Buscar qualificação criada por ID"
GET_RESPONSE=$(call_api GET "/qualificacoes/historico/$QUAL_ID" "" "200")

if echo "$GET_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  CERT_NUM=$(echo "$GET_RESPONSE" | jq -r '.data.numero_certificado // empty')
  if [ "$CERT_NUM" = "CERT-TEST-001" ]; then
    log_pass "GET retornou registro com dados corretos"
  else
    log_fail "Dados não correspondem ao criado. GET: $GET_RESPONSE"
  fi
else
  log_fail "GET falhou: $GET_RESPONSE"
fi

log_test "Validar erro - ID inválido (0, negativo)"
INVALID_GET=$(call_api GET "/qualificacoes/historico/0" "" "404")
if echo "$INVALID_GET" | jq -e '.success == false' > /dev/null 2>&1; then
  log_pass "GET com ID inválido retornou erro"
else
  log_fail "GET não rejeitou ID inválido: $INVALID_GET"
fi

# ===== TESTES PUT =====
log_header "TESTE 3: PUT /qualificacoes/historico/:id"

log_test "Atualizar qualificação com novos dados"
UPDATE_PAYLOAD=$(cat <<EOF
{
  "funcionario_id": $FUNCIONARIO_ID,
  "qualificacao_id": $QUALIFICACAO_ID,
  "data_conclusao": "2025-11-21T14:30:00Z",
  "data_vencimento": "2026-11-21T14:30:00Z",
  "numero_certificado": "CERT-TEST-UPDATE",
  "observacoes": "Atualizado em teste"
}
EOF
)

UPDATE_RESPONSE=$(call_api PUT "/qualificacoes/historico/$QUAL_ID" "$UPDATE_PAYLOAD" "200")
if echo "$UPDATE_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  log_pass "PUT funcionou"
  
  # Verificar se dados foram atualizados
  VERIFY_GET=$(call_api GET "/qualificacoes/historico/$QUAL_ID" "" "200")
  UPDATED_CERT=$(echo "$VERIFY_GET" | jq -r '.data.numero_certificado // empty')
  if [ "$UPDATED_CERT" = "CERT-TEST-UPDATE" ]; then
    log_pass "Dados foram persistidos corretamente"
  else
    log_fail "Dados não foram atualizados. Esperado: CERT-TEST-UPDATE, Obtido: $UPDATED_CERT"
  fi
else
  log_fail "PUT falhou: $UPDATE_RESPONSE"
fi

log_test "Validar erro - PUT com ID inexistente"
NONEXIST_PUT=$(call_api PUT "/qualificacoes/historico/99999" "$UPDATE_PAYLOAD" "404")
if echo "$NONEXIST_PUT" | jq -e '.success == false' > /dev/null 2>&1; then
  log_pass "PUT com ID inexistente retornou erro"
else
  log_fail "PUT não rejeitou ID inexistente: $NONEXIST_PUT"
fi

# ===== TESTES DELETE =====
log_header "TESTE 4: DELETE /qualificacoes/historico/:id"

log_test "Soft delete de qualificação"
DELETE_RESPONSE=$(call_api DELETE "/qualificacoes/historico/$QUAL_ID" "" "200")
if echo "$DELETE_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  log_pass "DELETE funcionou"
  
  # Verificar soft delete: GET ainda funciona mas deleted_at é setado
  AFTER_DELETE=$(curl -s -X GET \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    "$API_BASE/qualificacoes/historico-debug")
  log_debug "Estado pós-delete: $AFTER_DELETE"
else
  log_fail "DELETE falhou: $DELETE_RESPONSE"
fi

log_test "Validar erro - DELETE com ID inválido"
INVALID_DELETE=$(call_api DELETE "/qualificacoes/historico/invalid" "" "400")
if echo "$INVALID_DELETE" | jq -e '.success == false' > /dev/null 2>&1; then
  log_pass "DELETE com ID inválido retornou erro"
else
  log_fail "DELETE não rejeitou ID inválido: $INVALID_DELETE"
fi

# ===== TESTE LISTAGEM =====
log_header "TESTE 5: GET /qualificacoes/historico (Listagem)"

log_test "Listar histórico com paginação"
LIST_RESPONSE=$(call_api GET "/qualificacoes/historico?page=1&limit=10" "" "200")
if echo "$LIST_RESPONSE" | jq -e '.success == true' > /dev/null 2>&1; then
  TOTAL=$(echo "$LIST_RESPONSE" | jq -r '.meta.total // 0')
  PAGE=$(echo "$LIST_RESPONSE" | jq -r '.meta.page // 0')
  log_pass "Listagem funcionou. Total: $TOTAL, Página: $PAGE"
else
  log_fail "Listagem falhou: $LIST_RESPONSE"
fi

log_test "Listar com filtro por funcionário"
FILTERED=$(call_api GET "/qualificacoes/historico?funcionario_id=$FUNCIONARIO_ID" "" "200")
if echo "$FILTERED" | jq -e '.success == true' > /dev/null 2>&1; then
  log_pass "Filtro por funcionário funcionou"
else
  log_fail "Filtro falhou: $FILTERED"
fi

log_test "Validar stats inclusos na listagem"
if echo "$LIST_RESPONSE" | jq -e '.stats' > /dev/null 2>&1; then
  VALIDAS=$(echo "$LIST_RESPONSE" | jq -r '.stats.validas // 0')
  log_pass "Stats inclusos (válidas: $VALIDAS)"
else
  log_fail "Stats não retornados"
fi

# ===== RESUMO FINAL =====
log_header "RESUMO FINAL"
echo -e "${GREEN}✅ TESTES PASSARAM: $PASS_COUNT${NC}"
echo -e "${RED}❌ TESTES FALHARAM: $FAIL_COUNT${NC}"

if [ $FAIL_COUNT -eq 0 ]; then
  echo -e "\n${GREEN}🎉 TODOS OS TESTES PASSARAM!${NC}\n"
  exit 0
else
  echo -e "\n${RED}⚠️  ALGUNS TESTES FALHARAM${NC}\n"
  exit 1
fi
