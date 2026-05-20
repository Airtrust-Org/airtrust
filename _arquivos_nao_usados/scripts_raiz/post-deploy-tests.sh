#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

PROD_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "════════════════════════════════════════════════════════"
echo "🧪 TESTES PÓS-DEPLOY - VALIDAÇÃO COMPLETA"
echo "════════════════════════════════════════════════════════"
echo ""

PASS=0
FAIL=0

test_endpoint() {
    local path=$1
    local name=$2
    local check_field=$3
    
    echo -n "📋 $name ... "
    
    RESPONSE=$(curl -s "$PROD_URL$path")
    STATUS=$?
    
    if [ $STATUS -ne 0 ]; then
        echo -e "${RED}❌ FALHOU (curl error)${NC}"
        FAIL=$((FAIL + 1))
        return
    fi
    
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
    
    if [ "$SUCCESS" = "true" ]; then
        echo -e "${GREEN}✅ PASSOU${NC}"
        PASS=$((PASS + 1))
        
        # Se tem campo para verificar
        if [ ! -z "$check_field" ]; then
            HAS_FIELD=$(echo "$RESPONSE" | jq -r ".data[0].$check_field // empty" 2>/dev/null)
            if [ ! -z "$HAS_FIELD" ]; then
                echo "   ✅ Campo '$check_field' presente: $HAS_FIELD"
            fi
        fi
    else
        echo -e "${RED}❌ FALHOU${NC}"
        echo "   Erro: $(echo "$RESPONSE" | jq -r '.error // "Unknown"' 2>/dev/null)"
        FAIL=$((FAIL + 1))
    fi
}

# TESTE 1: Endpoints Novos (26 correções)
echo "🆕 TESTANDO ENDPOINTS NOVOS:"
echo "─────────────────────────────────────────────────"
test_endpoint "/api/v2/funcionarios/instrutores" "Instrutores" "nome"
test_endpoint "/api/v2/funcionarios/examinadores" "Examinadores" "nome"
test_endpoint "/api/v2/empresas" "Empresas" "nome"
test_endpoint "/api/v2/manobras" "Manobras" "codigo"

echo ""

# TESTE 2: Endpoints Antigos (não quebrou nada)
echo "📦 TESTANDO ENDPOINTS ANTIGOS:"
echo "─────────────────────────────────────────────────"
test_endpoint "/api/v2/funcionarios" "Funcionários"
test_endpoint "/api/v2/qualificacoes" "Qualificações"
test_endpoint "/api/v2/treinamentos" "Treinamentos"
test_endpoint "/api/v2/simuladores" "Simuladores"

echo ""

# TESTE 3: Campos Específicos Corrigidos
echo "🔧 TESTANDO CAMPOS CORRIGIDOS:"
echo "─────────────────────────────────────────────────"

echo -n "📋 Manobras - tempo_estimado ... "
MANOBRA=$(curl -s "$PROD_URL/api/v2/manobras" | jq -r '.data[0].tempo_estimado // empty' 2>/dev/null)
if [ ! -z "$MANOBRA" ]; then
    echo -e "${GREEN}✅ EXISTE${NC} (valor: $MANOBRA)"
    PASS=$((PASS + 1))
else
    echo -e "${RED}❌ NÃO EXISTE${NC}"
    FAIL=$((FAIL + 1))
fi

echo -n "📋 Manobras - pontuacao_maxima ... "
PONT=$(curl -s "$PROD_URL/api/v2/manobras" | jq -r '.data[0].pontuacao_maxima // empty' 2>/dev/null)
if [ ! -z "$PONT" ]; then
    echo -e "${GREEN}✅ EXISTE${NC} (valor: $PONT)"
    PASS=$((PASS + 1))
else
    echo -e "${RED}❌ NÃO EXISTE${NC}"
    FAIL=$((FAIL + 1))
fi

echo -n "📋 Empresas - logo_url ... "
LOGO=$(curl -s "$PROD_URL/api/v2/empresas" | jq -r '.data[0].logo_url // empty' 2>/dev/null)
if [ ! -z "$LOGO" ] || [ "$(curl -s "$PROD_URL/api/v2/empresas" | jq -r '.data[0] | has("logo_url")')" = "true" ]; then
    echo -e "${GREEN}✅ EXISTE${NC}"
    PASS=$((PASS + 1))
else
    echo -e "${RED}❌ NÃO EXISTE${NC}"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "📊 RESULTADO FINAL:"
echo "   ✅ Passou: $PASS"
echo "   ❌ Falhou: $FAIL"
echo "   📈 Taxa de sucesso: $((PASS * 100 / (PASS + FAIL)))%"
echo "════════════════════════════════════════════════════════"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}🎉 DEPLOY 100% SUCESSO!${NC}"
    echo ""
    echo "✅ Todos os endpoints funcionando"
    echo "✅ Campos corrigidos validados"
    echo "✅ Nada foi quebrado"
    echo ""
    echo "🎯 SISTEMA ESTÁ PRONTO PARA USO!"
    exit 0
else
    echo -e "${RED}⚠️  ALGUNS TESTES FALHARAM${NC}"
    echo ""
    echo "Verifique os erros acima."
    exit 1
fi
