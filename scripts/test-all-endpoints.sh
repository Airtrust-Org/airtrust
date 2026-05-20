#!/bin/bash
# Script para testar todos os endpoints e validar formato de resposta

PORT=8787
BASE="http://localhost:$PORT"
PASSED=0
FAILED=0

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        TESTE COMPLETO DE ENDPOINTS - AIRTRUST API            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

test_endpoint() {
    local endpoint=$1
    local name=$2
    local expected_key=$3
    
    echo -n "🔍 Testando $name ($endpoint) ... "
    
    response=$(curl -s -m 10 "$BASE$endpoint" 2>&1)
    status_code=$(curl -s -o /dev/null -w "%{http_code}" -m 10 "$BASE$endpoint" 2>&1)
    
    if [ "$status_code" != "200" ]; then
        echo "❌ FAIL (HTTP $status_code)"
        echo "   Response: $(echo "$response" | head -c 150)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Verificar se é JSON válido
    if ! echo "$response" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null; then
        echo "❌ FAIL (JSON inválido)"
        echo "   Response: $(echo "$response" | head -c 150)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Verificar formato esperado
    if [ -n "$expected_key" ]; then
        if echo "$response" | python3 -c "import sys, json; d=json.load(sys.stdin); sys.exit(0 if '$expected_key' in d else 1)" 2>/dev/null; then
            echo "✅ PASS"
            PASSED=$((PASSED + 1))
            return 0
        else
            echo "❌ FAIL (falta chave '$expected_key')"
            echo "   Keys: $(echo "$response" | python3 -c 'import sys, json; d=json.load(sys.stdin); print(list(d.keys())[:5])' 2>/dev/null)"
            FAILED=$((FAILED + 1))
            return 1
        fi
    else
        echo "✅ PASS (HTTP 200)"
        PASSED=$((PASSED + 1))
        return 0
    fi
}

# Testes básicos
echo "📋 TESTES BÁSICOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "/api/health" "Health Check" "status"
test_endpoint "/api/version" "Version" "success"

# Testes de dados principais
echo ""
echo "📊 TESTES DE DADOS PRINCIPAIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "/api/funcionarios?limit=1" "Funcionários" "success"
test_endpoint "/api/qualificacoes?limit=1" "Qualificações" "success"

# Testes de rotas v2
echo ""
echo "🔗 TESTES DE ROTAS /api/v2/*"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "/api/v2/compliance" "Compliance" "success"
test_endpoint "/api/v2/dashboard" "Dashboard" "success"
test_endpoint "/api/v2/treinamentos" "Treinamentos" "success"
test_endpoint "/api/v2/auditoria" "Auditoria" "success"
test_endpoint "/api/v2/simuladores" "Simuladores" "success"
test_endpoint "/api/v2/pasta-virtual" "Pasta Virtual" "success"

# Resumo
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                      RESUMO DOS TESTES                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Passou: $PASSED"
echo "❌ Falhou: $FAILED"
echo "📊 Total:  $((PASSED + FAILED))"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎉 TODOS OS TESTES PASSARAM!"
    exit 0
else
    echo "⚠️  ALGUNS TESTES FALHARAM"
    exit 1
fi

