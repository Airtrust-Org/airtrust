#!/bin/bash
set -o pipefail

BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"
REPORT_DIR="test-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$REPORT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0
TOTAL=0
CRITICAL_FAILED=0

declare -a TESTS_RESULTS

log_test() {
    TESTS_RESULTS+=("$1|$2|$3|$4|$5")
}

test_endpoint() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local expected="$4"
    local is_critical="${5:-false}"
    
    ((TOTAL++))
    
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "Test $TOTAL: $test_name"
    echo "Method: $method | Endpoint: $endpoint"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Fazer requisição corretamente para macOS
    if [ "$method" = "GET" ]; then
        HTTP_CODE=$(curl -s -o /tmp/response.txt -w "%{http_code}" "$BASE_URL$endpoint")
    else
        HTTP_CODE=$(curl -s -o /tmp/response.txt -w "%{http_code}" -X "$method" "$BASE_URL$endpoint" -H "Content-Type: application/json")
    fi
    
    BODY=$(cat /tmp/response.txt 2>/dev/null || echo "")
    PREVIEW=$(echo "$BODY" | head -c 150 | tr '\n' ' ')
    
    echo "HTTP Code: $HTTP_CODE"
    echo "Response: $PREVIEW..."
    
    local success=false
    if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
        if [ -z "$expected" ] || echo "$BODY" | grep -q "$expected"; then
            echo -e "${GREEN}✅ PASSOU${NC}"
            ((PASSED++))
            success=true
        else
            echo -e "${RED}❌ FALHOU: Padrão não encontrado${NC}"
            ((FAILED++))
            [ "$is_critical" = "true" ] && ((CRITICAL_FAILED++))
        fi
    else
        echo -e "${RED}❌ FALHOU: HTTP $HTTP_CODE${NC}"
        ((FAILED++))
        [ "$is_critical" = "true" ] && ((CRITICAL_FAILED++))
    fi
    
    log_test "$test_name" "$method" "$endpoint" "$HTTP_CODE" "$success"
}

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🧪 TESTES E2E COMPLETOS - AIRTRUST                       ║"
echo "╚════════════════════════════════════════════════════════════╝"

echo -e "\n${YELLOW}▶ BLOCO 1: HEALTH CHECK${NC}"
test_endpoint "Health Check" "GET" "/health" "status" "true"

echo -e "\n${YELLOW}▶ BLOCO 2: LISTAGENS${NC}"
test_endpoint "Listar Funcionários" "GET" "/api/v2/funcionarios" "success" "true"
test_endpoint "Listar Instrutores" "GET" "/api/v2/funcionarios/instrutores" "success" "true"
test_endpoint "Listar Simuladores" "GET" "/api/v2/simuladores" "" "false"
test_endpoint "Listar Agendamentos" "GET" "/api/v2/agendamentos" "success" "true"
test_endpoint "Listar Fichas" "GET" "/api/v2/fichas" "success" "true"
test_endpoint "Listar Manobras" "GET" "/api/v2/manobras" "success" "true"
test_endpoint "Listar Qualificações" "GET" "/api/v2/qualificacoes" "success" "true"
test_endpoint "Listar Habilitações" "GET" "/api/v2/habilitacoes" "success" "true"

echo -e "\n${YELLOW}▶ BLOCO 3: ENDPOINTS CONSOLIDADOS${NC}"
test_endpoint "Templates Consolidado" "GET" "/api/v2/simuladores-consolidado/templates" "" "false"
test_endpoint "Equipamentos Consolidado" "GET" "/api/v2/simuladores-consolidado/equipamentos" "" "false"
test_endpoint "Manobras Disponíveis" "GET" "/api/v2/simuladores-consolidado/manobras-disponiveis" "" "false"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                   RESULTADO FINAL                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Total de testes: $TOTAL"
echo -e "${GREEN}✅ Passou: $PASSED${NC}"
echo -e "${RED}❌ Falhou: $FAILED${NC}"
echo -e "Taxa de sucesso: ${GREEN}$((PASSED * 100 / TOTAL))%${NC}"
echo ""

# Gerar relatórios
MD_REPORT="$REPORT_DIR/RELATORIO_TESTES_E2E_$TIMESTAMP.md"
cat > "$MD_REPORT" << EOF
# 📊 RELATÓRIO DE TESTES E2E - AIRTRUST

**Data:** $(date '+%d de %B de %Y às %H:%M:%S')
**Status:** $([ $CRITICAL_FAILED -eq 0 ] && echo "✅ PRONTO" || echo "🚨 COM FALHAS")

## 📈 RESUMO

| Métrica | Valor |
|---------|-------|
| Total | $TOTAL |
| Passou | $PASSED ✅ |
| Falhou | $FAILED ❌ |
| Taxa | $((PASSED * 100 / TOTAL))% |
| Críticos Falhados | $CRITICAL_FAILED |

## 🧪 DETALHES

| # | Nome | Método | Endpoint | HTTP | Status |
|---|------|--------|----------|------|--------|
EOF

for i in "${!TESTS_RESULTS[@]}"; do
    ((idx=i+1))
    IFS='|' read -r name method endpoint http_code success <<< "${TESTS_RESULTS[$i]}"
    STATUS=$([ "$success" = "true" ] && echo "✅" || echo "❌")
    echo "| $idx | $name | $method | $endpoint | $http_code | $STATUS |" >> "$MD_REPORT"
done

echo "" >> "$MD_REPORT"
echo "---" >> "$MD_REPORT"
echo "**Gerado em:** $(date)" >> "$MD_REPORT"

echo "📊 Relatório salvo em: $MD_REPORT"
echo ""

[ $CRITICAL_FAILED -eq 0 ] && exit 0 || exit 1
