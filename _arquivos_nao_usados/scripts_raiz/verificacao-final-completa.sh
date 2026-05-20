#!/bin/bash

echo "🔍 VERIFICAÇÃO FINAL COMPLETA - TUDO IMPLEMENTADO?"
echo "════════════════════════════════════════════════════════════"
echo ""

PROD_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"
PASS=0
FAIL=0

test_endpoint() {
    local name=$1
    local endpoint=$2
    local expected=$3
    
    echo -n "Testing $name... "
    RESULT=$(curl -s "$PROD_URL$endpoint" | jq -r '.success' 2>/dev/null)
    
    if [ "$RESULT" = "true" ]; then
        echo "✅ OK"
        PASS=$((PASS + 1))
    else
        echo "❌ FALHOU"
        FAIL=$((FAIL + 1))
    fi
}

echo "📦 1. ENDPOINTS CRÍTICOS"
echo "────────────────────────────────────────────────────────────"
test_endpoint "Funcionários" "/api/v2/funcionarios"
test_endpoint "Instrutores" "/api/v2/funcionarios/instrutores"
test_endpoint "Funções" "/api/v2/funcoes"
test_endpoint "Simuladores" "/api/v2/simuladores"
test_endpoint "Modelos de Sessão" "/api/v2/simuladores/modelos"
test_endpoint "Manobras" "/api/v2/manobras"
test_endpoint "Categorias de Manobras" "/api/v2/manobras/categorias"
test_endpoint "Qualificações" "/api/v2/qualificacoes"
test_endpoint "Tipos de Qualificações" "/api/v2/tipos-qualificacoes"
test_endpoint "Categorias de Qualificações" "/api/v2/categorias-qualificacoes"
test_endpoint "Agendamentos" "/api/v2/agendamentos"
test_endpoint "Fichas" "/api/v2/fichas"
test_endpoint "Empresas" "/api/v2/empresas"
test_endpoint "Aeronaves" "/api/v2/aeronaves"

echo ""
echo "📊 2. DADOS CRÍTICOS"
echo "────────────────────────────────────────────────────────────"

# Modelos com manobras
MODELOS=$(curl -s "$PROD_URL/api/v2/simuladores/modelos" | jq -r '.data[0].total_manobras')
echo -n "Modelo 1 tem manobras... "
if [ "$MODELOS" = "22" ]; then
    echo "✅ OK (22 manobras)"
    PASS=$((PASS + 1))
else
    echo "❌ FALHOU (esperado 22, obteve $MODELOS)"
    FAIL=$((FAIL + 1))
fi

# Manobras totais
TOTAL_MANOBRAS=$(curl -s "$PROD_URL/api/v2/manobras" | jq -r '.data | length')
echo -n "Total de manobras... "
if [ "$TOTAL_MANOBRAS" -ge "70" ]; then
    echo "✅ OK ($TOTAL_MANOBRAS manobras)"
    PASS=$((PASS + 1))
else
    echo "❌ FALHOU (esperado ≥70, obteve $TOTAL_MANOBRAS)"
    FAIL=$((FAIL + 1))
fi

# Categorias
CATEGORIAS=$(curl -s "$PROD_URL/api/v2/categorias-qualificacoes" | jq -r '.data | length')
echo -n "Categorias de qualificações... "
if [ "$CATEGORIAS" = "5" ]; then
    echo "✅ OK (5 categorias)"
    PASS=$((PASS + 1))
else
    echo "❌ FALHOU (esperado 5, obteve $CATEGORIAS)"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "📁 3. ARQUIVOS CRÍTICOS"
echo "────────────────────────────────────────────────────────────"

check_file() {
    local file=$1
    local name=$2
    
    echo -n "Verificando $name... "
    if [ -f "$file" ]; then
        echo "✅ OK"
        PASS=$((PASS + 1))
    else
        echo "❌ FALTANDO"
        FAIL=$((FAIL + 1))
    fi
}

check_file "src/worker/api/v2/categorias-qualificacoes.ts" "Categorias API"
check_file "src/worker/api/v2/simuladores-modelos.ts" "Modelos API"
check_file "src/react-app/components/modelos/ReordenarManobras.tsx" "Componente Drag&Drop"
check_file "src/react-app/pages/simuladores/EditarModeloSessao.tsx" "Página Editar Modelo"
check_file "REIMPLEMENTACAO-COMPLETA.md" "Documentação"

echo ""
echo "🔧 4. BUILD E DEPLOY"
echo "────────────────────────────────────────────────────────────"

echo -n "Verificando último build... "
if [ -d "dist/client" ]; then
    BUILD_FILES=$(ls -1 dist/client/assets/*.js 2>/dev/null | wc -l)
    if [ "$BUILD_FILES" -gt "0" ]; then
        echo "✅ OK ($BUILD_FILES arquivos)"
        PASS=$((PASS + 1))
    else
        echo "❌ VAZIO"
        FAIL=$((FAIL + 1))
    fi
else
    echo "❌ NÃO EXISTE"
    FAIL=$((FAIL + 1))
fi

echo ""
echo "════════════════════════════════════════════════════════════"
echo "📊 RESULTADO FINAL"
echo "════════════════════════════════════════════════════════════"
echo ""
echo "   ✅ Passou: $PASS"
echo "   ❌ Falhou: $FAIL"
echo "   📈 Taxa de sucesso: $((PASS * 100 / (PASS + FAIL)))%"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "🎉🎉🎉 TUDO 100% IMPLEMENTADO E FUNCIONANDO! 🎉🎉🎉"
    echo ""
    echo "✅ Todos os endpoints funcionando"
    echo "✅ Todos os dados corretos"
    echo "✅ Todos os arquivos criados"
    echo "✅ Build gerado"
    echo "✅ Sistema em produção"
    echo ""
    echo "🚀 SISTEMA PRONTO PARA USO!"
    exit 0
else
    echo "⚠️  ALGUNS ITENS PRECISAM DE ATENÇÃO"
    echo ""
    echo "Verifique os itens marcados com ❌ acima."
    exit 1
fi
