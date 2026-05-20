#!/bin/bash
set -euo pipefail

API_URL="https://airtrust-api-production.airtrust.workers.dev"
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  TESTE E2E - MODAL QUALIFICAÇÃO${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. LOGIN
echo -e "${YELLOW}1️⃣ Fazendo login...${NC}"
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "teste@airtrust.com", "senha": "Teste@123"}' | jq -r ".data.accessToken")

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}❌ Erro ao fazer login${NC}"
  exit 1
fi
echo -e "${GREEN}✅ Token obtido${NC}"
echo ""

# 2. BUSCAR FUNCIONÁRIO (Bernardo CPF: 00003)
echo -e "${YELLOW}2️⃣ Buscando funcionário Bernardo Freire Antunes (00003)...${NC}"
FUNCIONARIO=$(curl -s "$API_URL/api/funcionarios-ssot?limit=100" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[] | select(.matricula == "00003")')

if [ -z "$FUNCIONARIO" ] || [ "$FUNCIONARIO" = "null" ]; then
  echo -e "${RED}❌ Funcionário não encontrado${NC}"
  exit 1
fi

CPF=$(echo "$FUNCIONARIO" | jq -r '.cpf')
NOME=$(echo "$FUNCIONARIO" | jq -r '.nome')
echo -e "${GREEN}✅ Funcionário encontrado: $NOME (CPF: $CPF)${NC}"
echo ""

# 3. BUSCAR QUALIFICAÇÃO (Conhecimentos Gerais de Aeronave - código B)
echo -e "${YELLOW}3️⃣ Buscando qualificação 'Conhecimentos Gerais de Aeronave' (código B)...${NC}"
QUALIFICACAO=$(curl -s "$API_URL/api/qualificacoes/tipos?limit=100" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.data[] | select(.codigo == "B")')

if [ -z "$QUALIFICACAO" ] || [ "$QUALIFICACAO" = "null" ]; then
  echo -e "${RED}❌ Qualificação não encontrada${NC}"
  exit 1
fi

CODIGO=$(echo "$QUALIFICACAO" | jq -r '.codigo')
NOME_QUAL=$(echo "$QUALIFICACAO" | jq -r '.nome')
VALIDADE=$(echo "$QUALIFICACAO" | jq -r '.validade')
echo -e "${GREEN}✅ Qualificação encontrada: $NOME_QUAL (Código: $CODIGO, Validade: $VALIDADE meses)${NC}"
echo ""

# 4. CRIAR HISTÓRICO DE QUALIFICAÇÃO
echo -e "${YELLOW}4️⃣ Criando histórico de qualificação...${NC}"
DATA_CONCLUSAO="2024-11-01"

PAYLOAD=$(cat <<EOF
{
  "funcionario_cpf": "$CPF",
  "qualificacao_codigo": "$CODIGO",
  "data_conclusao": "$DATA_CONCLUSAO",
  "nota": 4.5,
  "instrutor": "Dr. Silva",
  "local": "São Paulo",
  "modalidade": "PRESENCIAL",
  "observacoes": "Teste E2E do modal - script automatizado"
}
EOF
)

echo -e "${BLUE}📤 Payload:${NC}"
echo "$PAYLOAD" | jq "."
echo ""

RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_URL/api/qualificacoes/historico" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_STATUS=$(echo "$RESPONSE" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed -n '1,/HTTP_STATUS:/p' | sed '$d')

echo -e "${BLUE}📥 Response (HTTP $HTTP_STATUS):${NC}"
echo "$BODY" | jq "."
echo ""

if [ "$HTTP_STATUS" -ne 201 ]; then
  echo -e "${RED}❌ Erro ao criar qualificação (HTTP $HTTP_STATUS)${NC}"
  exit 1
fi

SUCCESS=$(echo "$BODY" | jq -r '.success')
if [ "$SUCCESS" != "true" ]; then
  echo -e "${RED}❌ Erro: success = false${NC}"
  exit 1
fi

ID=$(echo "$BODY" | jq -r '.data.id')
echo -e "${GREEN}✅ Qualificação criada com sucesso! ID: $ID${NC}"
echo ""

# 5. VERIFICAR REGISTRO NO BANCO
echo -e "${YELLOW}5️⃣ Verificando registro no banco...${NC}"
HISTORICO=$(curl -s "$API_URL/api/qualificacoes/historico/$ID" \
  -H "Authorization: Bearer $TOKEN")

echo -e "${BLUE}📊 Registro completo:${NC}"
echo "$HISTORICO" | jq '.data | {
  id,
  funcionario_nome,
  funcionario_cpf,
  qualificacao_nome,
  qualificacao_codigo,
  data_conclusao,
  data_vencimento,
  status,
  urgencia,
  nota,
  instrutor,
  local,
  modalidade
}'
echo ""

# 6. VALIDAÇÕES FINAIS
echo -e "${YELLOW}6️⃣ Validando dados...${NC}"

HISTORICO_CPF=$(echo "$HISTORICO" | jq -r '.data.funcionario_cpf')
HISTORICO_CODIGO=$(echo "$HISTORICO" | jq -r '.data.qualificacao_codigo')
HISTORICO_DATA=$(echo "$HISTORICO" | jq -r '.data.data_conclusao')
HISTORICO_STATUS=$(echo "$HISTORICO" | jq -r '.data.status')

if [ "$HISTORICO_CPF" != "$CPF" ]; then
  echo -e "${RED}❌ CPF não corresponde. Esperado: $CPF, Obtido: $HISTORICO_CPF${NC}"
  exit 1
fi

if [ "$HISTORICO_CODIGO" != "$CODIGO" ]; then
  echo -e "${RED}❌ Código não corresponde. Esperado: $CODIGO, Obtido: $HISTORICO_CODIGO${NC}"
  exit 1
fi

if [ "$HISTORICO_DATA" != "$DATA_CONCLUSAO" ]; then
  echo -e "${RED}❌ Data não corresponde. Esperado: $DATA_CONCLUSAO, Obtido: $HISTORICO_DATA${NC}"
  exit 1
fi

echo -e "${GREEN}✅ CPF correto: $HISTORICO_CPF${NC}"
echo -e "${GREEN}✅ Código correto: $HISTORICO_CODIGO${NC}"
echo -e "${GREEN}✅ Data de conclusão correta: $HISTORICO_DATA${NC}"
echo -e "${GREEN}✅ Status: $HISTORICO_STATUS${NC}"
echo ""

# 7. LIMPEZA (SOFT DELETE)
echo -e "${YELLOW}7️⃣ Limpando registro de teste...${NC}"
DELETE_RESPONSE=$(curl -s -X DELETE "$API_URL/api/qualificacoes/historico/$ID" \
  -H "Authorization: Bearer $TOKEN")

DELETE_SUCCESS=$(echo "$DELETE_RESPONSE" | jq -r '.success')
if [ "$DELETE_SUCCESS" = "true" ]; then
  echo -e "${GREEN}✅ Registro removido (soft delete)${NC}"
else
  echo -e "${YELLOW}⚠️  Aviso: não foi possível remover o registro${NC}"
fi
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✅ TODOS OS TESTES PASSARAM!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Resumo:${NC}"
echo -e "  • Funcionário: $NOME (CPF: $CPF)"
echo -e "  • Qualificação: $NOME_QUAL (Código: $CODIGO)"
echo -e "  • Data: $DATA_CONCLUSAO"
echo -e "  • ID criado: $ID"
echo -e "  • Status: $HISTORICO_STATUS"
echo ""
echo -e "${GREEN}✅ Modal de atribuir qualificação funcionando corretamente!${NC}"
