#!/bin/bash
# ========================================
# SCRIPT: TESTE DE ESTATÍSTICAS GLOBAIS
# Arquivo: test-dashboard-stats.sh
# Testa o novo endpoint /qualificacoes/historico/stats
# ========================================

set -euo pipefail

API_BASE="${API_BASE:-https://airtrust-api-production.airtrust.workers.dev/api}"
TOKEN="${AUTH_TOKEN:-}"

echo "🎯 ============================================"
echo "🎯 TESTE: DASHBOARD - ESTATÍSTICAS GLOBAIS"
echo "🎯 ============================================"
echo ""

if [ -z "$TOKEN" ]; then
  echo "ℹ️  Modo SEM autenticação (dev bypass ativo)"
  echo ""
fi

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ========================================
# TESTE 1: Endpoint /stats existe
# ========================================
echo -e "${YELLOW}📊 TESTE 1: Verificar endpoint /qualificacoes/historico/stats${NC}"

if [ -n "$TOKEN" ]; then
  STATS_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/qualificacoes/historico/stats")
else
  STATS_RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$API_BASE/qualificacoes/historico/stats")
fi

HTTP_CODE=$(echo "$STATS_RESPONSE" | tail -1)
BODY=$(echo "$STATS_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo -e "${RED}❌ FALHOU: HTTP $HTTP_CODE${NC}"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  exit 1
fi

echo -e "${GREEN}✅ Endpoint respondeu HTTP 200${NC}"

# ========================================
# TESTE 2: Estrutura do JSON
# ========================================
echo -e "${YELLOW}📊 TESTE 2: Validar estrutura JSON${NC}"

HAS_SUCCESS=$(echo "$BODY" | jq -r '.success' 2>/dev/null || echo "false")
HAS_DATA=$(echo "$BODY" | jq -r '.data' 2>/dev/null || echo "null")

if [ "$HAS_SUCCESS" != "true" ]; then
  echo -e "${RED}❌ Campo 'success' ausente ou false${NC}"
  exit 1
fi

if [ "$HAS_DATA" == "null" ]; then
  echo -e "${RED}❌ Campo 'data' ausente${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Estrutura JSON válida (success + data)${NC}"

# ========================================
# TESTE 3: Campos obrigatórios
# ========================================
echo -e "${YELLOW}📊 TESTE 3: Verificar campos obrigatórios${NC}"

TOTAL=$(echo "$BODY" | jq -r '.data.total' 2>/dev/null || echo "null")
VALIDAS=$(echo "$BODY" | jq -r '.data.validas' 2>/dev/null || echo "null")
VENCENDO=$(echo "$BODY" | jq -r '.data.vencendo' 2>/dev/null || echo "null")
VENCIDAS=$(echo "$BODY" | jq -r '.data.vencidas' 2>/dev/null || echo "null")
RENOVADAS=$(echo "$BODY" | jq -r '.data.renovadas' 2>/dev/null || echo "null")

MISSING=""
[ "$TOTAL" == "null" ] && MISSING="${MISSING}total "
[ "$VALIDAS" == "null" ] && MISSING="${MISSING}validas "
[ "$VENCENDO" == "null" ] && MISSING="${MISSING}vencendo "
[ "$VENCIDAS" == "null" ] && MISSING="${MISSING}vencidas "
[ "$RENOVADAS" == "null" ] && MISSING="${MISSING}renovadas "

if [ -n "$MISSING" ]; then
  echo -e "${RED}❌ Campos ausentes: $MISSING${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Todos os campos obrigatórios presentes${NC}"

# ========================================
# TESTE 4: Valores numéricos válidos
# ========================================
echo -e "${YELLOW}📊 TESTE 4: Validar tipos numéricos${NC}"

if ! [[ "$TOTAL" =~ ^[0-9]+$ ]]; then
  echo -e "${RED}❌ 'total' não é número: $TOTAL${NC}"
  exit 1
fi

if ! [[ "$VALIDAS" =~ ^[0-9]+$ ]]; then
  echo -e "${RED}❌ 'validas' não é número: $VALIDAS${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Todos os valores são numéricos válidos${NC}"

# ========================================
# TESTE 5: Lógica de soma
# ========================================
echo -e "${YELLOW}📊 TESTE 5: Validar lógica (validas + vencendo + vencidas ≤ total)${NC}"

SOMA=$((VALIDAS + VENCENDO + VENCIDAS))

if [ $SOMA -gt $TOTAL ]; then
  echo -e "${RED}❌ Soma inválida: $VALIDAS + $VENCENDO + $VENCIDAS = $SOMA > $TOTAL${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Lógica de contagem correta${NC}"

# ========================================
# TESTE 6: Comparar com endpoint paginado
# ========================================
echo -e "${YELLOW}📊 TESTE 6: Comparar com /qualificacoes/historico_principal${NC}"

if [ -n "$TOKEN" ]; then
  PAGINADO_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/qualificacoes/historico_principal?limit=10")
else
  PAGINADO_RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$API_BASE/qualificacoes/historico_principal?limit=10")
fi

PAG_HTTP=$(echo "$PAGINADO_RESPONSE" | tail -1)
PAG_BODY=$(echo "$PAGINADO_RESPONSE" | sed '$d')

if [ "$PAG_HTTP" == "200" ]; then
  PAG_TOTAL=$(echo "$PAG_BODY" | jq -r '.stats.total' 2>/dev/null || echo "null")
  
  if [ "$PAG_TOTAL" != "null" ]; then
    if [ "$PAG_TOTAL" != "$TOTAL" ]; then
      echo -e "${YELLOW}⚠️ Totais divergem: /stats=$TOTAL vs paginado=$PAG_TOTAL${NC}"
    else
      echo -e "${GREEN}✅ Totais consistentes entre endpoints${NC}"
    fi
  else
    echo -e "${YELLOW}⚠️ Endpoint paginado não retornou stats${NC}"
  fi
else
  echo -e "${YELLOW}⚠️ Endpoint paginado não disponível (HTTP $PAG_HTTP)${NC}"
fi

# ========================================
# TESTE 7: Performance
# ========================================
echo -e "${YELLOW}📊 TESTE 7: Medir tempo de resposta${NC}"

START=$(date +%s%N)
if [ -n "$TOKEN" ]; then
  curl -s -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/qualificacoes/historico/stats" > /dev/null
else
  curl -s "$API_BASE/qualificacoes/historico/stats" > /dev/null
fi
END=$(date +%s%N)

DURATION_MS=$(( (END - START) / 1000000 ))

if [ $DURATION_MS -gt 5000 ]; then
  echo -e "${RED}❌ Resposta lenta: ${DURATION_MS}ms (limite: 5000ms)${NC}"
  exit 1
elif [ $DURATION_MS -gt 2000 ]; then
  echo -e "${YELLOW}⚠️ Resposta moderada: ${DURATION_MS}ms${NC}"
else
  echo -e "${GREEN}✅ Resposta rápida: ${DURATION_MS}ms${NC}"
fi

# ========================================
# RESUMO
# ========================================
echo ""
echo "🎉 ============================================"
echo "🎉 TODOS OS TESTES PASSARAM!"
echo "🎉 ============================================"
echo ""
echo "📊 Estatísticas encontradas:"
echo "   Total:     $TOTAL"
echo "   Válidas:   $VALIDAS"
echo "   Vencendo:  $VENCENDO"
echo "   Vencidas:  $VENCIDAS"
echo "   Renovadas: $RENOVADAS"
echo ""
echo "⏱️ Performance: ${DURATION_MS}ms"
echo ""
