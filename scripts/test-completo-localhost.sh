#!/bin/bash
# Teste completo e rigoroso de todos os endpoints - localhost apenas

PORT=8787
BASE="http://localhost:$PORT"
PASSED=0
FAILED=0
WARNED=0
TOTAL=0

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     TESTE COMPLETO E RIGOROSO - LOCALHOST APENAS            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Base URL: $BASE"
echo "📅 Data: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

test_endpoint() {
    local endpoint=$1
    local name=$2
    local method=${3:-GET}
    local expected_format=${4:-"success"}
    
    TOTAL=$((TOTAL + 1))
    echo -n "[$TOTAL] Testing $name ($method $endpoint) ... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -m 10 -w "\nHTTP_CODE:%{http_code}" "$BASE$endpoint" 2>&1)
    else
        response=$(curl -s -m 10 -X "$method" -w "\nHTTP_CODE:%{http_code}" "$BASE$endpoint" 2>&1)
    fi
    
    http_code=$(echo "$response" | grep "HTTP_CODE:" | cut -d: -f2)
    body=$(echo "$response" | sed '/HTTP_CODE:/d')
    
    if [ -z "$http_code" ]; then
        echo "❌ FAIL (sem resposta)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    if [ "$http_code" != "200" ]; then
        echo "❌ FAIL (HTTP $http_code)"
        echo "   Response: $(echo "$body" | head -c 150)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Verificar se é JSON válido
    if ! echo "$body" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null; then
        echo "❌ FAIL (JSON inválido)"
        echo "   Response: $(echo "$body" | head -c 150)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Verificar formato esperado
    if [ "$expected_format" = "success" ]; then
        if echo "$body" | python3 -c "import sys, json; d=json.load(sys.stdin); sys.exit(0 if isinstance(d, dict) and ('success' in d or 'data' in d or 'status' in d) else 1)" 2>/dev/null; then
            # Verificar se tem success=true ou data
            has_success=$(echo "$body" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if isinstance(d, dict) and d.get('success') == True else 'false')" 2>/dev/null)
            has_data=$(echo "$body" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if isinstance(d, dict) and 'data' in d else 'false')" 2>/dev/null)
            
            if [ "$has_success" = "true" ] || [ "$has_data" = "true" ]; then
                echo "✅ PASS (HTTP $http_code, formato correto)"
                PASSED=$((PASSED + 1))
                return 0
            else
                echo "⚠️  WARN (HTTP $http_code, formato pode melhorar)"
                echo "   Keys: $(echo "$body" | python3 -c 'import sys, json; d=json.load(sys.stdin); print(list(d.keys())[:5])' 2>/dev/null)"
                WARNED=$((WARNED + 1))
                return 0
            fi
        else
            echo "❌ FAIL (formato incorreto - não é objeto com success/data)"
            echo "   Type: $(echo "$body" | python3 -c 'import sys, json; d=json.load(sys.stdin); print(type(d).__name__)' 2>/dev/null)"
            FAILED=$((FAILED + 1))
            return 1
        fi
    else
        echo "✅ PASS (HTTP $http_code)"
        PASSED=$((PASSED + 1))
        return 0
    fi
}

# TESTES BÁSICOS
echo "📋 TESTES BÁSICOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "/api/health" "Health Check" "GET" "any"
test_endpoint "/api/version" "Version" "GET" "success"
test_endpoint "/health" "Health (root)" "GET" "any"

# TESTES DE DADOS PRINCIPAIS
echo ""
echo "📊 TESTES DE DADOS PRINCIPAIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "/api/funcionarios?limit=1" "Funcionários (GET)" "GET" "success"
test_endpoint "/api/qualificacoes?limit=1" "Qualificações (GET)" "GET" "success"
test_endpoint "/api/categorias" "Categorias" "GET" "success"
test_endpoint "/api/funcoes" "Funções" "GET" "success"
test_endpoint "/api/setores" "Setores" "GET" "success"
test_endpoint "/api/aeronaves" "Aeronaves" "GET" "success"
test_endpoint "/api/empresas" "Empresas" "GET" "success"

# TESTES DE FUNCIONALIDADES
echo ""
echo "🔧 TESTES DE FUNCIONALIDADES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "/api/compliance" "Compliance" "GET" "success"
test_endpoint "/api/dashboard" "Dashboard" "GET" "success"
test_endpoint "/api/treinamentos" "Treinamentos" "GET" "success"
test_endpoint "/api/auditoria" "Auditoria" "GET" "success"
test_endpoint "/api/simuladores" "Simuladores" "GET" "success"
test_endpoint "/api/pasta-virtual" "Pasta Virtual" "GET" "success"
test_endpoint "/api/auth" "Auth" "GET" "any"
test_endpoint "/api/sistema" "Sistema" "GET" "success"
test_endpoint "/api/notificacoes" "Notificações" "GET" "success"
test_endpoint "/api/relatorios" "Relatórios" "GET" "success"

# TESTES DE ENDPOINTS ESPECÍFICOS
echo ""
echo "🎯 TESTES DE ENDPOINTS ESPECÍFICOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "/api/qualificacoes-list" "Qualificações List" "GET" "success"
test_endpoint "/api/historico" "Histórico" "GET" "success"
test_endpoint "/api/certificados" "Certificados" "GET" "success"
test_endpoint "/api/sessoes" "Sessões" "GET" "success"
test_endpoint "/api/manobras" "Manobras" "GET" "success"
test_endpoint "/api/importacoes" "Importações" "GET" "success"
test_endpoint "/api/import" "Import" "GET" "any"

# RESUMO
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                      RESUMO DOS TESTES                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "✅ Passou: $PASSED"
echo "⚠️  Avisos: $WARNED"
echo "❌ Falhou: $FAILED"
echo "📊 Total:  $TOTAL"

if [ $TOTAL -gt 0 ]; then
    success_rate=$(python3 -c "print(f'{($PASSED/$TOTAL*100):.1f}%')" 2>/dev/null || echo "N/A")
    echo "📈 Taxa de Sucesso: $success_rate"
fi

echo ""

if [ $FAILED -eq 0 ] && [ $WARNED -eq 0 ]; then
    echo "🎉 TODOS OS TESTES PASSARAM PERFEITAMENTE!"
    exit 0
elif [ $FAILED -eq 0 ]; then
    echo "✅ TODOS OS TESTES PASSARAM (com alguns avisos)"
    exit 0
else
    echo "⚠️  ALGUNS TESTES FALHARAM - Verifique os detalhes acima"
    exit 1
fi


