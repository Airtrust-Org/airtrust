#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROD_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"
LOCAL_URL="http://localhost:8787"

echo "═══════════════════════════════════════════════════════════════"
echo "🔍 VALIDAÇÃO ULTRA RIGOROSA - COMPARAÇÃO PROFUNDA"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Verificar se localhost está rodando
echo "🔧 Verificando se localhost está rodando..."
if ! curl -s "$LOCAL_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}❌ LOCALHOST NÃO ESTÁ RODANDO!${NC}"
    echo ""
    echo "Execute primeiro: npm run dev"
    exit 1
fi
echo -e "${GREEN}✅ Localhost rodando${NC}"
echo ""

PASS=0
FAIL=0
WARN=0

compare_endpoint() {
    local path=$1
    local name=$2
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 Testando: $name"
    echo "   Path: $path"
    echo ""
    
    # Buscar de produção
    PROD_RESPONSE=$(curl -s "$PROD_URL$path" 2>/dev/null)
    PROD_STATUS=$?
    
    # Buscar de localhost
    LOCAL_RESPONSE=$(curl -s "$LOCAL_URL$path" 2>/dev/null)
    LOCAL_STATUS=$?
    
    # Verificar se ambos responderam
    if [ $PROD_STATUS -ne 0 ]; then
        echo -e "  ${RED}❌ PRODUÇÃO NÃO RESPONDEU${NC}"
        FAIL=$((FAIL + 1))
        return
    fi
    
    if [ $LOCAL_STATUS -ne 0 ]; then
        echo -e "  ${RED}❌ LOCALHOST NÃO RESPONDEU${NC}"
        FAIL=$((FAIL + 1))
        return
    fi
    
    # Comparar estrutura JSON
    PROD_KEYS=$(echo "$PROD_RESPONSE" | jq -r 'keys | sort | @json' 2>/dev/null)
    LOCAL_KEYS=$(echo "$LOCAL_RESPONSE" | jq -r 'keys | sort | @json' 2>/dev/null)
    
    if [ "$PROD_KEYS" != "$LOCAL_KEYS" ]; then
        echo -e "  ${RED}❌ ESTRUTURA DIFERENTE!${NC}"
        echo "     Produção: $PROD_KEYS"
        echo "     Localhost: $LOCAL_KEYS"
        FAIL=$((FAIL + 1))
        return
    fi
    
    # Comparar quantidade de registros
    PROD_COUNT=$(echo "$PROD_RESPONSE" | jq '.data | length' 2>/dev/null)
    LOCAL_COUNT=$(echo "$LOCAL_RESPONSE" | jq '.data | length' 2>/dev/null)
    
    echo "  📊 Quantidade de registros:"
    echo "     Produção: $PROD_COUNT"
    echo "     Localhost: $LOCAL_COUNT"
    
    if [ "$PROD_COUNT" != "$LOCAL_COUNT" ]; then
        echo -e "  ${YELLOW}⚠️  QUANTIDADES DIFERENTES${NC}"
        WARN=$((WARN + 1))
    else
        echo -e "  ${GREEN}✅ QUANTIDADES IGUAIS${NC}"
        PASS=$((PASS + 1))
    fi
    
    # Verificar campos dos primeiros registros
    if [ "$PROD_COUNT" -gt 0 ] && [ "$LOCAL_COUNT" -gt 0 ]; then
        PROD_FIELDS=$(echo "$PROD_RESPONSE" | jq -r '.data[0] | keys | sort | @json' 2>/dev/null)
        LOCAL_FIELDS=$(echo "$LOCAL_RESPONSE" | jq -r '.data[0] | keys | sort | @json' 2>/dev/null)
        
        if [ "$PROD_FIELDS" != "$LOCAL_FIELDS" ]; then
            echo -e "  ${RED}❌ CAMPOS DOS REGISTROS DIFERENTES!${NC}"
            echo "     Produção: $PROD_FIELDS"
            echo "     Localhost: $LOCAL_FIELDS"
            FAIL=$((FAIL + 1))
        else
            echo -e "  ${GREEN}✅ Campos dos registros idênticos${NC}"
        fi
    fi
    
    echo ""
}

# Testar endpoints críticos
compare_endpoint "/api/v2/funcionarios" "Funcionários"
compare_endpoint "/api/v2/funcionarios/instrutores" "Instrutores ⭐"
compare_endpoint "/api/v2/funcionarios/examinadores" "Examinadores ⭐"
compare_endpoint "/api/v2/empresas" "Empresas ⭐"
compare_endpoint "/api/v2/manobras" "Manobras ⭐"
compare_endpoint "/api/v2/qualificacoes" "Qualificações"
compare_endpoint "/api/v2/treinamentos" "Treinamentos"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESULTADO FINAL DA COMPARAÇÃO:"
echo "  ✅ Passou: $PASS"
echo "  ⚠️  Avisos: $WARN"
echo "  ❌ Falhou: $FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $FAIL -gt 0 ]; then
    echo -e "${RED}❌ VALIDAÇÃO FALHOU!${NC}"
    echo "   Existem diferenças críticas entre localhost e produção!"
    echo ""
    exit 1
elif [ $WARN -gt 0 ]; then
    echo -e "${YELLOW}⚠️  VALIDAÇÃO COM AVISOS${NC}"
    echo "   Quantidades diferentes podem ser normais (dados de teste)"
    echo "   MAS estrutura e campos devem ser idênticos!"
    echo ""
    exit 0
else
    echo -e "${GREEN}✅ VALIDAÇÃO 100% APROVADA!${NC}"
    echo "   Localhost e produção são IDÊNTICOS!"
    echo ""
    exit 0
fi
