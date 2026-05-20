#!/bin/bash
# Teste rigoroso e sistemático - localhost apenas

PORT=8787
BASE="http://localhost:$PORT"
PASSED=0
FAILED=0
WARNED=0
TOTAL=0
RESULTS_FILE="/tmp/test-results-$(date +%Y%m%d-%H%M%S).json"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     TESTE RIGOROSO E SISTEMÁTICO - LOCALHOST APENAS          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "🌐 Base URL: $BASE"
echo "📅 Data: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Verificar se servidor está rodando
if ! curl -s -m 3 "$BASE/api/health" > /dev/null; then
    echo "❌ ERRO: Servidor não está respondendo em $BASE"
    echo "   Execute: npm run dev:worker"
    exit 1
fi

test_endpoint() {
    local endpoint=$1
    local name=$2
    local method=${3:-GET}
    local expected_format=${4:-"success"}
    
    TOTAL=$((TOTAL + 1))
    printf "[%2d] %-50s " "$TOTAL" "$name"
    
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
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Verificar se é JSON válido
    if ! echo "$body" | python3 -c "import sys, json; json.load(sys.stdin)" 2>/dev/null; then
        echo "❌ FAIL (JSON inválido)"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    # Verificar formato esperado
    if [ "$expected_format" = "success" ]; then
        is_dict=$(echo "$body" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if isinstance(d, dict) else 'false')" 2>/dev/null)
        has_success=$(echo "$body" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if isinstance(d, dict) and d.get('success') == True else 'false')" 2>/dev/null)
        has_data=$(echo "$body" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if isinstance(d, dict) and 'data' in d else 'false')" 2>/dev/null)
        is_array=$(echo "$body" | python3 -c "import sys, json; d=json.load(sys.stdin); print('true' if isinstance(d, list) else 'false')" 2>/dev/null)
        
        if [ "$has_success" = "true" ] || [ "$has_data" = "true" ]; then
            echo "✅ PASS"
            PASSED=$((PASSED + 1))
            return 0
        elif [ "$is_array" = "true" ]; then
            echo "⚠️  WARN (array direto, sem wrapper)"
            WARNED=$((WARNED + 1))
            return 0
        else
            echo "❌ FAIL (formato incorreto)"
            FAILED=$((FAILED + 1))
            return 1
        fi
    else
        echo "✅ PASS"
        PASSED=$((PASSED + 1))
        return 0
    fi
}

# TESTES BÁSICOS
echo "📋 TESTES BÁSICOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "/api/health" "Health Check" "GET" "any"
test_endpoint "/api/version" "Version" "GET" "any"
test_endpoint "/ping" "Ping (app)" "GET" "any"
test_endpoint "/api/test" "Test (app)" "GET" "any"

# TESTES DE DADOS PRINCIPAIS
echo ""
echo "📊 TESTES DE DADOS PRINCIPAIS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
test_endpoint "/api/funcionarios?limit=1" "Funcionários" "GET" "success"
test_endpoint "/api/qualificacoes?limit=1" "Qualificações" "GET" "success"
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

# Salvar resultados
cat > "$RESULTS_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "base_url": "$BASE",
  "total": $TOTAL,
  "passed": $PASSED,
  "failed": $FAILED,
  "warned": $WARNED,
  "success_rate": "$success_rate"
}
EOF

echo "📄 Resultados salvos em: $RESULTS_FILE"

if [ $FAILED -eq 0 ] && [ $WARNED -eq 0 ]; then
    echo ""
    echo "🎉 TODOS OS TESTES PASSARAM PERFEITAMENTE!"
    exit 0
elif [ $FAILED -eq 0 ]; then
    echo ""
    echo "✅ TODOS OS TESTES PASSARAM (com alguns avisos)"
    exit 0
else
    echo ""
    echo "⚠️  ALGUNS TESTES FALHARAM - Verifique os detalhes acima"
    exit 1
fi

