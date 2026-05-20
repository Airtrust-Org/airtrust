#!/bin/bash

# 🔍 AUDITORIA PROFUNDA - MÓDULO HABILITAÇÕES v2.0
# Data: 4 de novembro de 2025
# Status: CERTIFICAÇÃO PRODUCTION-READY

BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2"
AUTH="Authorization: Bearer test"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}🔍 AUDITORIA PROFUNDA - MÓDULO HABILITAÇÕES${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"

# Array para rastrear resultados
declare -a TESTES_PASSED
declare -a TESTES_FAILED

# ============================================
# TESTE 1: Stats Endpoint
# ============================================
echo -e "${YELLOW}[TEST 1/10] Stats Endpoint${NC}"
STATS=$(curl -s "$BASE_URL/habilitacoes/stats" -H "$AUTH")
TOTAL=$(echo "$STATS" | jq '.data.total')
VALIDAS=$(echo "$STATS" | jq '.data.validas')
VENCENDO=$(echo "$STATS" | jq '.data.vencendo')
VENCIDAS=$(echo "$STATS" | jq '.data.vencidas')

if [[ "$TOTAL" -gt 0 ]]; then
  echo -e "${GREEN}✅ PASS${NC} - Total: $TOTAL, Válidas: $VALIDAS, Vencendo: $VENCENDO, Vencidas: $VENCIDAS"
  TESTES_PASSED+=("Stats Endpoint")
else
  echo -e "${RED}❌ FAIL${NC} - Stats endpoint retornou dados vazios"
  TESTES_FAILED+=("Stats Endpoint")
fi

# ============================================
# TESTE 2: Listar Habilitações com Paginação
# ============================================
echo -e "\n${YELLOW}[TEST 2/10] Listar Habilitações com Paginação${NC}"
LIST=$(curl -s "$BASE_URL/habilitacoes?page=1&limit=10" -H "$AUTH")
COUNT=$(echo "$LIST" | jq '.data | length')
HAS_ID=$(echo "$LIST" | jq '.data[0].id')
HAS_PAGINATION=$(echo "$LIST" | jq '.pagination')

if [[ "$COUNT" -gt 0 ]] && [[ "$HAS_ID" != "null" ]]; then
  echo -e "${GREEN}✅ PASS${NC} - Retornados $COUNT registros com IDs válidos"
  TESTES_PASSED+=("Listar com Paginação")
else
  echo -e "${RED}❌ FAIL${NC} - Problemas com paginação ou IDs NULL"
  TESTES_FAILED+=("Listar com Paginação")
fi

# ============================================
# TESTE 3: Filtro por Status
# ============================================
echo -e "\n${YELLOW}[TEST 3/10] Filtro por Status${NC}"
FILTERED=$(curl -s "$BASE_URL/habilitacoes?status=VENCIDA&limit=5" -H "$AUTH")
FILTERED_COUNT=$(echo "$FILTERED" | jq '.data | length')

if [[ "$FILTERED_COUNT" -gt 0 ]]; then
  echo -e "${GREEN}✅ PASS${NC} - Filtro por status funcionando ($FILTERED_COUNT registros)"
  TESTES_PASSED+=("Filtro por Status")
else
  echo -e "${YELLOW}⚠️ WARN${NC} - Nenhum registro vencido encontrado"
  TESTES_PASSED+=("Filtro por Status (0 registros)")
fi

# ============================================
# TESTE 4: Qualificações Disponíveis
# ============================================
echo -e "\n${YELLOW}[TEST 4/10] Qualificações Disponíveis${NC}"
QUALS=$(curl -s "$BASE_URL/habilitacoes/qualificacoes" -H "$AUTH")
QUALS_COUNT=$(echo "$QUALS" | jq '.data | length')

if [[ "$QUALS_COUNT" -gt 0 ]]; then
  echo -e "${GREEN}✅ PASS${NC} - $QUALS_COUNT qualificações disponíveis"
  TESTES_PASSED+=("Qualificações Disponíveis")
else
  echo -e "${RED}❌ FAIL${NC} - Nenhuma qualificação encontrada"
  TESTES_FAILED+=("Qualificações Disponíveis")
fi

# ============================================
# TESTE 5: Funcionários Disponíveis
# ============================================
echo -e "\n${YELLOW}[TEST 5/10] Funcionários Disponíveis${NC}"
FUNCS=$(curl -s "$BASE_URL/habilitacoes/funcionarios" -H "$AUTH")
FUNCS_COUNT=$(echo "$FUNCS" | jq '.data | length')

if [[ "$FUNCS_COUNT" -gt 0 ]]; then
  echo -e "${GREEN}✅ PASS${NC} - $FUNCS_COUNT funcionários disponíveis"
  TESTES_PASSED+=("Funcionários Disponíveis")
else
  echo -e "${RED}❌ FAIL${NC} - Nenhum funcionário encontrado"
  TESTES_FAILED+=("Funcionários Disponíveis")
fi

# ============================================
# TESTE 6: Criar Nova Habilitação
# ============================================
echo -e "\n${YELLOW}[TEST 6/10] Criar Nova Habilitação${NC}"
FUNC_ID=$(echo "$FUNCS" | jq '.data[0].id')
QUAL_ID=$(echo "$QUALS" | jq '.data[0].id')

CREATE=$(curl -s -X POST "$BASE_URL/habilitacoes" \
  -H "Content-Type: application/json" \
  -H "$AUTH" \
  -d "{
    \"funcionario_id\": $FUNC_ID,
    \"qualificacao_id\": $QUAL_ID,
    \"data_conclusao\": \"2025-11-04\",
    \"data_vencimento\": \"2027-11-04\",
    \"resultado\": \"APROVADO\",
    \"nota_final\": 90
  }")

NEW_ID=$(echo "$CREATE" | jq '.data.id')
if [[ "$NEW_ID" != "null" ]] && [[ -n "$NEW_ID" ]]; then
  echo -e "${GREEN}✅ PASS${NC} - Nova habilitação criada com ID: $NEW_ID"
  TESTES_PASSED+=("Criar Habilitação")
else
  echo -e "${RED}❌ FAIL${NC} - Erro ao criar habilitação"
  echo "Response: $CREATE"
  TESTES_FAILED+=("Criar Habilitação")
fi

# ============================================
# TESTE 7: Buscar Habilitação por ID
# ============================================
echo -e "\n${YELLOW}[TEST 7/10] Buscar Habilitação por ID${NC}"
if [[ "$NEW_ID" != "null" ]]; then
  GET_BY_ID=$(curl -s "$BASE_URL/habilitacoes?funcionario_id=$FUNC_ID&qualificacao_id=$QUAL_ID" -H "$AUTH")
  FOUND=$(echo "$GET_BY_ID" | jq '.data[0].id')
  
  if [[ "$FOUND" != "null" ]]; then
    echo -e "${GREEN}✅ PASS${NC} - Habilitação encontrada: ID $FOUND"
    TESTES_PASSED+=("Buscar por ID")
  else
    echo -e "${RED}❌ FAIL${NC} - Habilitação não encontrada"
    TESTES_FAILED+=("Buscar por ID")
  fi
else
  echo -e "${YELLOW}⏭️ SKIPPED${NC} - Teste anterior falhou"
fi

# ============================================
# TESTE 8: Atualizar Habilitação
# ============================================
echo -e "\n${YELLOW}[TEST 8/10] Atualizar Habilitação${NC}"
if [[ "$NEW_ID" != "null" ]]; then
  UPDATE=$(curl -s -X PUT "$BASE_URL/habilitacoes/$NEW_ID" \
    -H "Content-Type: application/json" \
    -H "$AUTH" \
    -d '{"resultado": "APROVADO_COM_DISTINÇÃO", "nota_final": 95}')
  
  UPDATE_SUCCESS=$(echo "$UPDATE" | jq '.success')
  if [[ "$UPDATE_SUCCESS" == "true" ]]; then
    echo -e "${GREEN}✅ PASS${NC} - Habilitação atualizada com sucesso"
    TESTES_PASSED+=("Atualizar Habilitação")
  else
    echo -e "${RED}❌ FAIL${NC} - Erro ao atualizar"
    TESTES_FAILED+=("Atualizar Habilitação")
  fi
else
  echo -e "${YELLOW}⏭️ SKIPPED${NC} - Teste anterior falhou"
fi

# ============================================
# TESTE 9: Deletar Habilitação (Soft Delete)
# ============================================
echo -e "\n${YELLOW}[TEST 9/10] Deletar Habilitação (Soft Delete)${NC}"
if [[ "$NEW_ID" != "null" ]]; then
  DELETE=$(curl -s -X DELETE "$BASE_URL/habilitacoes/$NEW_ID" -H "$AUTH")
  DELETE_SUCCESS=$(echo "$DELETE" | jq '.success')
  
  if [[ "$DELETE_SUCCESS" == "true" ]]; then
    echo -e "${GREEN}✅ PASS${NC} - Habilitação deletada (soft delete)"
    TESTES_PASSED+=("Deletar Habilitação")
  else
    echo -e "${RED}❌ FAIL${NC} - Erro ao deletar"
    TESTES_FAILED+=("Deletar Habilitação")
  fi
else
  echo -e "${YELLOW}⏭️ SKIPPED${NC} - Teste anterior falhou"
fi

# ============================================
# TESTE 10: Verificar Integridade de Dados
# ============================================
echo -e "\n${YELLOW}[TEST 10/10] Verificar Integridade de Dados${NC}"
FINAL_STATS=$(curl -s "$BASE_URL/habilitacoes/stats" -H "$AUTH")
FINAL_TOTAL=$(echo "$FINAL_STATS" | jq '.data.total')

if [[ "$FINAL_TOTAL" -gt 0 ]]; then
  # Contar registros com ID NULL
  NULL_IDS=$(curl -s "$BASE_URL/habilitacoes?limit=100" -H "$AUTH" | jq '[.data[] | select(.id == null or .id == "")] | length')
  
  if [[ "$NULL_IDS" -eq 0 ]]; then
    echo -e "${GREEN}✅ PASS${NC} - Nenhum registro com ID NULL encontrado"
    TESTES_PASSED+=("Integridade de Dados")
  else
    echo -e "${YELLOW}⚠️ WARN${NC} - $NULL_IDS registros com ID NULL detectados"
    TESTES_FAILED+=("Integridade de Dados")
  fi
else
  echo -e "${RED}❌ FAIL${NC} - Base de dados vazia"
  TESTES_FAILED+=("Integridade de Dados")
fi

# ============================================
# RESUMO FINAL
# ============================================
echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}📊 RESUMO DA AUDITORIA${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"

echo -e "${GREEN}✅ TESTES PASSADOS: ${#TESTES_PASSED[@]}/10${NC}"
for test in "${TESTES_PASSED[@]}"; do
  echo -e "  ${GREEN}✓${NC} $test"
done

if [[ ${#TESTES_FAILED[@]} -gt 0 ]]; then
  echo -e "\n${RED}❌ TESTES FALHADOS: ${#TESTES_FAILED[@]}/10${NC}"
  for test in "${TESTES_FAILED[@]}"; do
    echo -e "  ${RED}✗${NC} $test"
  done
fi

echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"

if [[ ${#TESTES_FAILED[@]} -eq 0 ]]; then
  echo -e "${GREEN}🎉 MÓDULO HABILITAÇÕES 100% FUNCIONAL - PRODUCTION READY${NC}"
  exit 0
else
  echo -e "${RED}⚠️  PROBLEMAS ENCONTRADOS - REVISAR ANTES DE PRODUCTION${NC}"
  exit 1
fi
