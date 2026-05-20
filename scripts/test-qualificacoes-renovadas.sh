#!/bin/bash

# ============================================================
# TESTE: Qualificações Renovadas
# ============================================================
# 
# Este script testa a lógica de marcação de qualificações renovadas:
# 1. Cria qualificação inicial
# 2. Renova ANTES de vencer → deve marcar como renovada ✅
# 3. Renova APÓS vencer → NÃO deve marcar como renovada ❌
# 4. Verifica estatísticas no dashboard
# ============================================================

set -e

API="https://airtrust-api-production.airtrust.workers.dev/api"
# API="http://localhost:8787/api"

echo "🧪 TESTE: Qualificações Renovadas"
echo "================================="
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============================================================
# 1. BUSCAR UM FUNCIONÁRIO E QUALIFICAÇÃO DE TESTE
# ============================================================

echo "📋 1. Buscando funcionário e qualificação para teste..."

# Buscar primeiro funcionário
FUNCIONARIO=$(curl -s "$API/funcionarios?limit=1" | jq -r '.data[0]')
FUNCIONARIO_CPF=$(echo "$FUNCIONARIO" | jq -r '.cpf')
FUNCIONARIO_NOME=$(echo "$FUNCIONARIO" | jq -r '.nome')

if [ -z "$FUNCIONARIO_CPF" ] || [ "$FUNCIONARIO_CPF" = "null" ]; then
  echo -e "${RED}❌ Nenhum funcionário encontrado${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Funcionário: $FUNCIONARIO_NOME (CPF: $FUNCIONARIO_CPF)${NC}"

# Buscar qualificação de teste
QUALIFICACAO=$(curl -s "$API/qualificacoes/tipos?limit=1" | jq -r '.data[0]')
QUALIFICACAO_CODIGO=$(echo "$QUALIFICACAO" | jq -r '.codigo')
QUALIFICACAO_NOME=$(echo "$QUALIFICACAO" | jq -r '.nome')

if [ -z "$QUALIFICACAO_CODIGO" ] || [ "$QUALIFICACAO_CODIGO" = "null" ]; then
  echo -e "${RED}❌ Nenhuma qualificação encontrada${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Qualificação: $QUALIFICACAO_NOME (Código: $QUALIFICACAO_CODIGO)${NC}"
echo ""

# ============================================================
# 2. CRIAR QUALIFICAÇÃO INICIAL
# ============================================================

echo "📝 2. Criando qualificação inicial..."

DATA_INICIAL="2024-01-01"
DATA_VENC_INICIAL="2025-01-01"

RESPONSE=$(curl -s -X POST "$API/qualificacoes/historico" \
  -H "Content-Type: application/json" \
  -d "{
    \"funcionario_cpf\": \"$FUNCIONARIO_CPF\",
    \"qualificacao_codigo\": \"$QUALIFICACAO_CODIGO\",
    \"data_conclusao\": \"$DATA_INICIAL\",
    \"data_vencimento\": \"$DATA_VENC_INICIAL\",
    \"validade_meses\": 12,
    \"numero_certificado\": \"TEST-001\",
    \"observacoes\": \"Qualificação inicial para teste de renovação\"
  }")

QUAL_ID_1=$(echo "$RESPONSE" | jq -r '.data.id // .id')

if [ -z "$QUAL_ID_1" ] || [ "$QUAL_ID_1" = "null" ]; then
  echo -e "${RED}❌ Erro ao criar qualificação inicial${NC}"
  echo "$RESPONSE" | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Qualificação inicial criada (ID: $QUAL_ID_1)${NC}"
echo -e "   📅 Data conclusão: $DATA_INICIAL"
echo -e "   📅 Data vencimento: $DATA_VENC_INICIAL"
echo ""

# ============================================================
# 3. RENOVAR ANTES DE VENCER (deve marcar como renovada)
# ============================================================

echo "🔄 3. Renovando ANTES de vencer..."

DATA_RENOVACAO="2024-11-15"  # 45 dias ANTES de vencer
DATA_VENC_RENOVACAO="2025-11-15"

RESPONSE=$(curl -s -X POST "$API/qualificacoes/historico" \
  -H "Content-Type: application/json" \
  -d "{
    \"funcionario_cpf\": \"$FUNCIONARIO_CPF\",
    \"qualificacao_codigo\": \"$QUALIFICACAO_CODIGO\",
    \"data_conclusao\": \"$DATA_RENOVACAO\",
    \"data_vencimento\": \"$DATA_VENC_RENOVACAO\",
    \"validade_meses\": 12,
    \"numero_certificado\": \"TEST-002\",
    \"observacoes\": \"Renovação ANTES de vencer (deve ser marcada como renovada=1)\"
  }")

QUAL_ID_2=$(echo "$RESPONSE" | jq -r '.data.id // .id')

if [ -z "$QUAL_ID_2" ] || [ "$QUAL_ID_2" = "null" ]; then
  echo -e "${RED}❌ Erro ao criar renovação${NC}"
  echo "$RESPONSE" | jq '.'
  exit 1
fi

echo -e "${GREEN}✅ Renovação criada (ID: $QUAL_ID_2)${NC}"
echo -e "   📅 Data conclusão: $DATA_RENOVACAO (ANTES de vencer)"
echo -e "   📅 Data vencimento anterior: $DATA_VENC_INICIAL"
echo -e "   ⏰ Antecedência: 45 dias"
echo ""

# Aguardar trigger executar
sleep 2

# Verificar se foi marcada como renovada
RENOVADA=$(curl -s "$API/qualificacoes/historico/$QUAL_ID_2" | jq -r '.data.renovada // .renovada')

echo "🔍 Verificando flag renovada..."
if [ "$RENOVADA" = "1" ]; then
  echo -e "${GREEN}✅ SUCESSO: Qualificação marcada como renovada=1${NC}"
else
  echo -e "${YELLOW}⚠️  ATENÇÃO: renovada=$RENOVADA (esperado: 1)${NC}"
fi
echo ""

# ============================================================
# 4. RENOVAR APÓS VENCER (NÃO deve marcar como renovada)
# ============================================================

echo "⏰ 4. Renovando APÓS vencer (não é renovação)..."

# Criar outra qualificação inicial que já venceu
DATA_INICIAL_2="2023-01-01"
DATA_VENC_INICIAL_2="2024-01-01"

RESPONSE=$(curl -s -X POST "$API/qualificacoes/historico" \
  -H "Content-Type: application/json" \
  -d "{
    \"funcionario_cpf\": \"$FUNCIONARIO_CPF\",
    \"qualificacao_codigo\": \"TESTE-RENOVACAO-POS\",
    \"data_conclusao\": \"$DATA_INICIAL_2\",
    \"data_vencimento\": \"$DATA_VENC_INICIAL_2\",
    \"validade_meses\": 12,
    \"numero_certificado\": \"TEST-003\"
  }")

QUAL_ID_3=$(echo "$RESPONSE" | jq -r '.data.id // .id')

# Renovar APÓS vencer
DATA_RENOVACAO_POS="2024-03-01"  # 60 dias DEPOIS de vencer
DATA_VENC_RENOVACAO_POS="2025-03-01"

RESPONSE=$(curl -s -X POST "$API/qualificacoes/historico" \
  -H "Content-Type: application/json" \
  -d "{
    \"funcionario_cpf\": \"$FUNCIONARIO_CPF\",
    \"qualificacao_codigo\": \"TESTE-RENOVACAO-POS\",
    \"data_conclusao\": \"$DATA_RENOVACAO_POS\",
    \"data_vencimento\": \"$DATA_VENC_RENOVACAO_POS\",
    \"validade_meses\": 12,
    \"numero_certificado\": \"TEST-004\",
    \"observacoes\": \"Renovação APÓS vencer (NÃO deve ser marcada como renovada)\"
  }")

QUAL_ID_4=$(echo "$RESPONSE" | jq -r '.data.id // .id')

if [ -z "$QUAL_ID_4" ] || [ "$QUAL_ID_4" = "null" ]; then
  echo -e "${YELLOW}⚠️  Erro ao criar renovação pós-vencimento (pode ser esperado)${NC}"
else
  echo -e "${GREEN}✅ Qualificação criada após vencer (ID: $QUAL_ID_4)${NC}"
  
  sleep 2
  
  RENOVADA_POS=$(curl -s "$API/qualificacoes/historico/$QUAL_ID_4" | jq -r '.data.renovada // .renovada')
  
  echo "🔍 Verificando flag renovada..."
  if [ "$RENOVADA_POS" = "0" ]; then
    echo -e "${GREEN}✅ CORRETO: Qualificação NÃO marcada como renovada (renovada=0)${NC}"
  else
    echo -e "${YELLOW}⚠️  ATENÇÃO: renovada=$RENOVADA_POS (esperado: 0)${NC}"
  fi
fi
echo ""

# ============================================================
# 5. VERIFICAR DASHBOARD
# ============================================================

echo "📊 5. Verificando dashboard..."

DASHBOARD=$(curl -s "$API/dashboard/qualificacoes")

TOTAL=$(echo "$DASHBOARD" | jq -r '.data.total_ativas')
RENOVADAS=$(echo "$DASHBOARD" | jq -r '.data.renovadas')
VALIDAS=$(echo "$DASHBOARD" | jq -r '.data.validas')
VENCIDAS=$(echo "$DASHBOARD" | jq -r '.data.vencidas')

echo -e "${BLUE}📈 Estatísticas Gerais:${NC}"
echo -e "   Total Ativas: $TOTAL"
echo -e "   ${GREEN}Renovadas: $RENOVADAS${NC}"
echo -e "   Válidas: $VALIDAS"
echo -e "   Vencidas: $VENCIDAS"
echo ""

# ============================================================
# 6. VERIFICAR ENDPOINT /historico/stats
# ============================================================

echo "📊 6. Verificando endpoint /historico/stats..."

STATS=$(curl -s "$API/qualificacoes/historico/stats")

STATS_TOTAL=$(echo "$STATS" | jq -r '.data.total')
STATS_RENOVADAS=$(echo "$STATS" | jq -r '.data.renovadas')

echo -e "${BLUE}📈 Stats Histórico:${NC}"
echo -e "   Total: $STATS_TOTAL"
echo -e "   ${GREEN}Renovadas: $STATS_RENOVADAS${NC}"
echo ""

# ============================================================
# RESUMO FINAL
# ============================================================

echo "================================="
echo "🎯 RESUMO DO TESTE"
echo "================================="
echo ""

if [ "$RENOVADAS" -gt 0 ]; then
  echo -e "${GREEN}✅ Dashboard retornando renovadas corretamente${NC}"
else
  echo -e "${YELLOW}⚠️  Dashboard com 0 renovadas (verificar se há qualificações renovadas)${NC}"
fi

if [ "$RENOVADA" = "1" ]; then
  echo -e "${GREEN}✅ Lógica de renovação ANTES de vencer funcionando${NC}"
else
  echo -e "${RED}❌ Lógica de renovação ANTES de vencer com problema${NC}"
fi

echo ""
echo -e "${BLUE}📚 Conceito de Renovação:${NC}"
echo "   ✅ Renovada = Obtida ANTES da anterior vencer"
echo "   ❌ Não renovada = Obtida APÓS vencer (é nova qualificação)"
echo ""

echo "🎉 Teste concluído!"
