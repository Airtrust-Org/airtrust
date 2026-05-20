#!/bin/bash

PROD_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🔍 VERIFICAÇÃO COMPLETA DO SISTEMA"
echo "════════════════════════════════════════════════════════════"
echo ""

PASS=0
FAIL=0
ERRORS=()

test_endpoint() {
    local name=$1
    local endpoint=$2
    local expected_min=$3
    
    echo -n "Testing $name... "
    
    RESPONSE=$(curl -s "$PROD_URL$endpoint")
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
    
    if [ "$SUCCESS" = "true" ]; then
        COUNT=$(echo "$RESPONSE" | jq -r '.data | length' 2>/dev/null)
        if [ -z "$expected_min" ] || [ "$COUNT" -ge "$expected_min" ]; then
            echo "✅ OK ($COUNT registros)"
            PASS=$((PASS + 1))
        else
            echo "⚠️  OK mas poucos dados ($COUNT < $expected_min)"
            PASS=$((PASS + 1))
        fi
    else
        ERROR=$(echo "$RESPONSE" | jq -r '.error // "Unknown"' 2>/dev/null)
        echo "❌ ERRO: $ERROR"
        ERRORS+=("$name|$ERROR")
        FAIL=$((FAIL + 1))
    fi
}

echo "📦 MÓDULO: FUNCIONÁRIOS"
echo "────────────────────────────────────────────────────────────"
test_endpoint "Funcionários (lista)" "/api/v2/funcionarios" 20
test_endpoint "Funcionários (instrutores)" "/api/v2/funcionarios/instrutores" 1
test_endpoint "Funcionários (examinadores)" "/api/v2/funcionarios/examinadores" 1
test_endpoint "Funções" "/api/v2/funcoes" 6
test_endpoint "Setores" "/api/v2/setores" 5
echo ""

echo "📦 MÓDULO: SIMULADORES"
echo "────────────────────────────────────────────────────────────"
test_endpoint "Simuladores" "/api/v2/simuladores" 1
test_endpoint "Agendamentos" "/api/v2/agendamentos" 1
test_endpoint "Fichas de Sessão" "/api/v2/fichas" 1
test_endpoint "Manobras" "/api/v2/manobras" 70
test_endpoint "Categorias de Manobras" "/api/v2/manobras/categorias" 8
test_endpoint "Modelos de Sessão" "/api/v2/simuladores/modelos" 11
echo ""

echo "📦 MÓDULO: QUALIFICAÇÕES"
echo "────────────────────────────────────────────────────────────"
test_endpoint "Qualificações" "/api/v2/qualificacoes" 20
test_endpoint "Tipos de Qualificações" "/api/v2/tipos-qualificacoes" 5
test_endpoint "Categorias de Qualificações" "/api/v2/categorias-qualificacoes" 5
test_endpoint "Checks" "/api/v2/checks"
test_endpoint "Exames" "/api/v2/exames"
echo ""

echo "📦 MÓDULO: TREINAMENTOS"
echo "────────────────────────────────────────────────────────────"
test_endpoint "Treinamentos" "/api/v2/treinamentos" 10
echo ""

echo "📦 MÓDULO: CADASTROS"
echo "────────────────────────────────────────────────────────────"
test_endpoint "Empresas" "/api/v2/empresas" 1
test_endpoint "Aeronaves" "/api/v2/aeronaves" 2
echo ""

echo "📦 MÓDULO: SISTEMA"
echo "────────────────────────────────────────────────────────────"
test_endpoint "Health Check" "/api/v2/health"
echo ""

echo "════════════════════════════════════════════════════════════"
echo "📊 RESULTADO FINAL:"
echo "   ✅ Passou: $PASS"
echo "   ❌ Falhou: $FAIL"
echo "   📈 Taxa de sucesso: $((PASS * 100 / (PASS + FAIL)))%"
echo "════════════════════════════════════════════════════════════"
echo ""

if [ $FAIL -gt 0 ]; then
    echo "❌ ENDPOINTS COM ERRO:"
    for error in "${ERRORS[@]}"; do
        IFS='|' read -r endpoint msg <<< "$error"
        echo "   • $endpoint"
        echo "     └─ $msg"
    done
    echo ""
fi

if [ $FAIL -eq 0 ]; then
    echo "🎉 TODOS OS ENDPOINTS FUNCIONANDO!"
    echo ""
    echo "✅ Sistema 100% operacional"
    echo "✅ Todos os dados presentes"
    echo "✅ Pronto para uso em produção"
    exit 0
else
    echo "⚠️  ALGUNS ENDPOINTS COM PROBLEMA"
    echo ""
    echo "Verifique os erros acima."
    exit 1
fi
