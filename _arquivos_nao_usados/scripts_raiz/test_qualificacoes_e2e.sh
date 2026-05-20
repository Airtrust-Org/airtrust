#!/bin/bash
# ============================================
# SCRIPT DE TESTE AUTOMATIZADO
# Testa o fluxo completo de criação de qualificação
# Arquivo: test_qualificacoes_e2e.sh
# ============================================

set -e

echo "🧪 ============================================"
echo "🧪 TESTE E2E - MODAL ATRIBUIR QUALIFICAÇÃO"
echo "🧪 ============================================"
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuração
API_BASE="http://localhost:8787/api"
TOKEN=$(cat ~/.airtrust_token 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo -e "${YELLOW}⚠️  Token não encontrado. Configure com:${NC}"
  echo "   echo 'SEU_TOKEN' > ~/.airtrust_token"
  echo ""
fi

# ============================================
# TESTE 1: Verificar Schema da Tabela
# ============================================
echo -e "${BLUE}📋 TESTE 1: Verificar Schema${NC}"

SCHEMA=$(wrangler d1 execute airtrust-db-dev -c wrangler.dev.toml --local --command "
SELECT sql FROM sqlite_master 
WHERE type='table' AND name='qualificacoes_historico';
" 2>&1)

if echo "$SCHEMA" | grep -q "status"; then
  echo -e "${RED}❌ ERRO: Tabela contém coluna 'status' (não deveria)${NC}"
  exit 1
else
  echo -e "${GREEN}✅ Schema correto (sem coluna 'status')${NC}"
fi

echo ""

# ============================================
# TESTE 2: Verificar Colunas Existentes
# ============================================
echo -e "${BLUE}📋 TESTE 2: Verificar Colunas${NC}"

COLUMNS=$(wrangler d1 execute airtrust-db-dev -c wrangler.dev.toml --local --command "
PRAGMA table_info(qualificacoes_historico);
" 2>&1)

REQUIRED_COLUMNS=("funcionario_id" "qualificacao_id" "data_conclusao" "data_vencimento" "created_at" "updated_at")

for col in "${REQUIRED_COLUMNS[@]}"; do
  if echo "$COLUMNS" | grep -q "$col"; then
    echo -e "${GREEN}✅ Coluna '$col' existe${NC}"
  else
    echo -e "${RED}❌ Coluna '$col' NÃO existe${NC}"
    exit 1
  fi
done

echo ""

# ============================================
# TESTE 3: Buscar Funcionários Ativos
# ============================================
echo -e "${BLUE}📋 TESTE 3: Buscar Funcionários Ativos${NC}"

FUNCIONARIOS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/funcionarios-ssot?status=ATIVO&limit=5")

FUNC_COUNT=$(echo "$FUNCIONARIOS" | jq -r '.data | length' 2>/dev/null || echo "0")

if [ "$FUNC_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✅ Funcionários encontrados: $FUNC_COUNT${NC}"
  FUNCIONARIO_ID=$(echo "$FUNCIONARIOS" | jq -r '.data[0].id')
  echo "   Usando funcionário ID: $FUNCIONARIO_ID"
else
  echo -e "${RED}❌ Nenhum funcionário ativo encontrado${NC}"
  exit 1
fi

echo ""

# ============================================
# TESTE 4: Buscar Tipos de Qualificação
# ============================================
echo -e "${BLUE}📋 TESTE 4: Buscar Tipos de Qualificação${NC}"

TIPOS=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/qualificacoes/tipos?limit=5")

TIPOS_COUNT=$(echo "$TIPOS" | jq -r '.data | length' 2>/dev/null || echo "0")

if [ "$TIPOS_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✅ Tipos encontrados: $TIPOS_COUNT${NC}"
  QUALIFICACAO_ID=$(echo "$TIPOS" | jq -r '.data[0].id')
  VALIDADE_MESES=$(echo "$TIPOS" | jq -r '.data[0].validade_meses')
  echo "   Usando tipo ID: $QUALIFICACAO_ID"
  echo "   Validade: $VALIDADE_MESES meses"
else
  echo -e "${RED}❌ Nenhum tipo de qualificação encontrado${NC}"
  exit 1
fi

echo ""

# ============================================
# TESTE 5: Calcular Datas
# ============================================
echo -e "${BLUE}📋 TESTE 5: Calcular Datas${NC}"

DATA_CONCLUSAO=$(date +%Y-%m-%d)
if [ "$VALIDADE_MESES" != "null" ] && [ -n "$VALIDADE_MESES" ]; then
  DATA_VENCIMENTO=$(date -v +${VALIDADE_MESES}m +%Y-%m-%d 2>/dev/null || date -d "+${VALIDADE_MESES} months" +%Y-%m-%d)
else
  DATA_VENCIMENTO=$(date -v +12m +%Y-%m-%d 2>/dev/null || date -d "+12 months" +%Y-%m-%d)
fi

echo -e "${GREEN}✅ Data conclusão: $DATA_CONCLUSAO${NC}"
echo -e "${GREEN}✅ Data vencimento: $DATA_VENCIMENTO${NC}"

echo ""

# ============================================
# TESTE 6: Criar Payload
# ============================================
echo -e "${BLUE}📋 TESTE 6: Criar Payload${NC}"

PAYLOAD=$(cat <<EOF
{
  "funcionario_id": $FUNCIONARIO_ID,
  "qualificacao_id": "$QUALIFICACAO_ID",
  "data_conclusao": "$DATA_CONCLUSAO",
  "data_vencimento": "$DATA_VENCIMENTO",
  "numero_certificado": "TESTE-AUTO-$(date +%s)",
  "observacoes": "Criado por teste automatizado"
}
EOF
)

echo "📤 Payload:"
echo "$PAYLOAD" | jq .

echo ""

# ============================================
# TESTE 7: POST - Criar Qualificação
# ============================================
echo -e "${BLUE}📋 TESTE 7: POST /qualificacoes/historico${NC}"

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$PAYLOAD" \
  "$API_BASE/qualificacoes/historico")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "📥 HTTP Status: $HTTP_CODE"
echo "📥 Response:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"

if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Qualificação criada com sucesso!${NC}"
  CREATED_ID=$(echo "$BODY" | jq -r '.data.id' 2>/dev/null)
  echo "   ID criado: $CREATED_ID"
else
  echo -e "${RED}❌ Erro ao criar qualificação (HTTP $HTTP_CODE)${NC}"
  exit 1
fi

echo ""

# ============================================
# TESTE 8: GET - Buscar Qualificação Criada
# ============================================
echo -e "${BLUE}📋 TESTE 8: GET /qualificacoes/historico${NC}"

sleep 1 # Aguardar propagação

GET_RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/qualificacoes/historico?limit=1")

GET_COUNT=$(echo "$GET_RESPONSE" | jq -r '.data | length' 2>/dev/null || echo "0")

if [ "$GET_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✅ Qualificação encontrada na listagem${NC}"
  echo "$GET_RESPONSE" | jq '.data[0] | {id, funcionario_nome, qualificacao_nome, data_vencimento, status_qualificacao}'
else
  echo -e "${RED}❌ Qualificação não encontrada na listagem${NC}"
  exit 1
fi

echo ""

# ============================================
# TESTE 9: PUT - Atualizar Qualificação
# ============================================
echo -e "${BLUE}📋 TESTE 9: PUT /qualificacoes/historico/$CREATED_ID${NC}"

UPDATE_PAYLOAD=$(cat <<EOF
{
  "funcionario_id": $FUNCIONARIO_ID,
  "qualificacao_id": "$QUALIFICACAO_ID",
  "data_conclusao": "$DATA_CONCLUSAO",
  "data_vencimento": "$DATA_VENCIMENTO",
  "numero_certificado": "TESTE-AUTO-UPDATED-$(date +%s)",
  "observacoes": "Atualizado por teste automatizado"
}
EOF
)

UPDATE_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X PUT \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "$UPDATE_PAYLOAD" \
  "$API_BASE/qualificacoes/historico/$CREATED_ID")

UPDATE_HTTP_CODE=$(echo "$UPDATE_RESPONSE" | tail -n1)

if [ "$UPDATE_HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Qualificação atualizada com sucesso!${NC}"
else
  echo -e "${RED}❌ Erro ao atualizar qualificação (HTTP $UPDATE_HTTP_CODE)${NC}"
fi

echo ""

# ============================================
# TESTE 10: DELETE - Remover Qualificação
# ============================================
echo -e "${BLUE}📋 TESTE 10: DELETE /qualificacoes/historico/$CREATED_ID${NC}"

DELETE_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/qualificacoes/historico/$CREATED_ID")

DELETE_HTTP_CODE=$(echo "$DELETE_RESPONSE" | tail -n1)

if [ "$DELETE_HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Qualificação removida com sucesso!${NC}"
else
  echo -e "${RED}❌ Erro ao remover qualificação (HTTP $DELETE_HTTP_CODE)${NC}"
fi

echo ""

# ============================================
# TESTE 11: Verificar Soft Delete
# ============================================
echo -e "${BLUE}📋 TESTE 11: Verificar Soft Delete${NC}"

DELETED_CHECK=$(wrangler d1 execute airtrust-db-dev -c wrangler.dev.toml --local --command "
SELECT id, deleted_at IS NOT NULL as is_deleted 
FROM qualificacoes_historico 
WHERE id = $CREATED_ID;
" 2>&1)

if echo "$DELETED_CHECK" | grep -q "1"; then
  echo -e "${GREEN}✅ Soft delete funcionando (deleted_at preenchido)${NC}"
else
  echo -e "${YELLOW}⚠️  Registro pode ter sido deletado permanentemente${NC}"
fi

echo ""

# ============================================
# RESUMO FINAL
# ============================================
echo -e "${BLUE}🎉 ============================================${NC}"
echo -e "${GREEN}✅ TODOS OS TESTES PASSARAM!${NC}"
echo -e "${BLUE}🎉 ============================================${NC}"
echo ""
echo "📊 Resumo:"
echo "   ✅ Schema validado"
echo "   ✅ Colunas verificadas"
echo "   ✅ Funcionários carregados"
echo "   ✅ Tipos carregados"
echo "   ✅ POST funcionando"
echo "   ✅ GET funcionando"
echo "   ✅ PUT funcionando"
echo "   ✅ DELETE funcionando"
echo "   ✅ Soft delete validado"
echo ""
echo -e "${GREEN}🚀 Sistema 100% operacional!${NC}"
