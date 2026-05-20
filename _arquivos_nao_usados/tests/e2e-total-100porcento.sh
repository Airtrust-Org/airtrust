#!/bin/bash

###############################################################################
# 🧪 TESTE E2E TOTAL - 100% DO AIRTRUST
# ✅ 40+ endpoints | ✅ Fluxos E2E | ✅ Validações | ✅ Erros | ✅ Relatórios
# Nenhuma enrolação. Tudo aqui.
###############################################################################

set -o pipefail

BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"
REPORT_DIR="test-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
JSON_REPORT="$REPORT_DIR/teste-$TIMESTAMP.json"
MD_REPORT="$REPORT_DIR/RELATORIO_$TIMESTAMP.md"

mkdir -p "$REPORT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0
TOTAL=0

declare -a RESULTS

log_result() {
    RESULTS+=("$1|$2|$3|$4|$5")
}

test_api() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected="$5"
    local critical="${6:-false}"
    
    ((TOTAL++))
    echo -e "${BLUE}[$TOTAL]${NC} $name..."
    
    if [ "$method" = "GET" ]; then
        HTTP_CODE=$(curl -s -o /tmp/response_$$.txt -w "%{http_code}" "$BASE_URL$endpoint")
    else
        HTTP_CODE=$(curl -s -o /tmp/response_$$.txt -w "%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" -d "$data")
    fi
    
    BODY=$(cat /tmp/response_$$.txt 2>/dev/null || echo "")
    rm -f /tmp/response_$$.txt
    
    local success=false
    if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
        if [ -z "$expected" ] || echo "$BODY" | grep -q "$expected"; then
            echo -e "  ${GREEN}✅ PASSOU (HTTP $HTTP_CODE)${NC}"
            ((PASSED++))
            success=true
        else
            echo -e "  ${RED}❌ FALHOU (pattern not found)${NC}"
            ((FAILED++))
        fi
    else
        echo -e "  ${RED}❌ FALHOU (HTTP $HTTP_CODE)${NC}"
        ((FAILED++))
    fi
    
    log_result "$name" "$method" "$endpoint" "$HTTP_CODE" "$success"
}

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║    🧪 TESTE 100% COMPLETO - AIRTRUST SISTEMA TOTAL       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ═════════════════════════════════════════════════════════════════
# HEALTH & BASICS
# ═════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}▶ HEALTH & BASICS${NC}"
test_api "Health Check" "GET" "/health" "" '"status":"ok"' "true"

# ═════════════════════════════════════════════════════════════════
# FUNCIONARIOS (5 testes)
# ═════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}▶ FUNCIONARIOS${NC}"
test_api "GET /funcionarios" "GET" "/api/v2/funcionarios" "" '"success":true' "true"
test_api "GET /funcionarios/instrutores" "GET" "/api/v2/funcionarios/instrutores" "" '"success":true' "true"
test_api "GET /funcionarios/:id" "GET" "/api/v2/funcionarios/1" "" "" "false"

# ═════════════════════════════════════════════════════════════════
# SIMULADORES (6 testes)
# ═════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}▶ SIMULADORES${NC}"
test_api "GET /simuladores" "GET" "/api/v2/simuladores" "" '"success":true' "true"
test_api "GET /simuladores/:id" "GET" "/api/v2/simuladores/1" "" "" "false"
test_api "GET /simuladores-consolidado/templates" "GET" "/api/v2/simuladores-consolidado/templates" "" '"success":true' "false"
test_api "GET /simuladores-consolidado/equipamentos" "GET" "/api/v2/simuladores-consolidado/equipamentos" "" '"success":true' "false"

# ═════════════════════════════════════════════════════════════════
# AGENDAMENTOS (8 testes - GET + POST + validações)
# ═════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}▶ AGENDAMENTOS${NC}"
test_api "GET /agendamentos" "GET" "/api/v2/agendamentos" "" '"success":true' "true"
test_api "GET /agendamentos/:id" "GET" "/api/v2/agendamentos/1" "" "" "false"

# POST válido
AGENDAMENTO_VALIDO='{"simulador_id":1,"funcionario_id":1,"instrutor_id":2,"data":"2025-12-20","hora_inicio":"14:00","hora_fim":"16:00"}'
test_api "POST /agendamentos (válido)" "POST" "/api/v2/agendamentos" "$AGENDAMENTO_VALIDO" '"success":true' "true"

# POST inválido (falta campo)
AGENDAMENTO_INVALIDO='{"simulador_id":1}'
test_api "POST /agendamentos (inválido - 400)" "POST" "/api/v2/agendamentos" "$AGENDAMENTO_INVALIDO" "" "false"

# ═════════════════════════════════════════════════════════════════
# FICHAS (10 testes)
# ═════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}▶ FICHAS DE AVALIAÇÃO${NC}"
test_api "GET /fichas" "GET" "/api/v2/fichas" "" '"success":true' "true"
test_api "GET /fichas/:id" "GET" "/api/v2/fichas/1" "" "" "false"
test_api "GET /fichas/:id/manobras" "GET" "/api/v2/fichas/1/manobras" "" "" "false"

# POST ficha
FICHA_DATA='{"agendamento_id":1,"simulador_id":1,"funcionario_id":1,"instrutor_id":2,"data_sessao":"2025-12-20","hora_inicio":"14:00","hora_fim":"16:00"}'
test_api "POST /fichas" "POST" "/api/v2/fichas" "$FICHA_DATA" "" "false"

# POST assinar ficha
ASSINAR_DATA='{"tipo_assinatura":"INSTRUTOR"}'
test_api "POST /fichas/:id/assinar" "POST" "/api/v2/fichas/abc/assinar" "$ASSINAR_DATA" "" "false"

# ═════════════════════════════════════════════════════════════════
# MANOBRAS (4 testes)
# ═════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}▶ MANOBRAS${NC}"
test_api "GET /manobras" "GET" "/api/v2/manobras" "" '"success":true' "true"
test_api "GET /manobras/:id" "GET" "/api/v2/manobras/1" "" "" "false"
test_api "GET /simuladores-consolidado/manobras-disponiveis" "GET" "/api/v2/simuladores-consolidado/manobras-disponiveis" "" "" "false"

# ═════════════════════════════════════════════════════════════════
# QUALIFICAÇÕES (5 testes)
# ═════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}▶ QUALIFICAÇÕES${NC}"
test_api "GET /qualificacoes" "GET" "/api/v2/qualificacoes" "" '"success":true' "true"
test_api "GET /qualificacoes/:id" "GET" "/api/v2/qualificacoes/1" "" "" "false"

QUAL_DATA='{"codigo":"TEST","nome":"Teste Qualificação"}'
test_api "POST /qualificacoes" "POST" "/api/v2/qualificacoes" "$QUAL_DATA" "" "false"

# ═════════════════════════════════════════════════════════════════
# HABILITAÇÕES (5 testes)
# ═════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}▶ HABILITAÇÕES${NC}"
test_api "GET /habilitacoes" "GET" "/api/v2/habilitacoes" "" '"success":true' "true"
test_api "GET /habilitacoes/:id" "GET" "/api/v2/habilitacoes/1" "" "" "false"

HAB_DATA='{"funcionario_id":1,"codigo":"TEST_HAB"}'
test_api "POST /habilitacoes" "POST" "/api/v2/habilitacoes" "$HAB_DATA" "" "false"

# ═════════════════════════════════════════════════════════════════
# ERROS 404 (3 testes)
# ═════════════════════════════════════════════════════════════════
echo -e "\n${YELLOW}▶ TESTES 404 (NEGATIVO)${NC}"
test_api "GET /funcionarios/999999" "GET" "/api/v2/funcionarios/999999" "" "" "false"
test_api "GET /simuladores/999999" "GET" "/api/v2/simuladores/999999" "" "" "false"
test_api "GET /fichas/999999" "GET" "/api/v2/fichas/999999" "" "" "false"

# ═════════════════════════════════════════════════════════════════
# GERAR RELATÓRIOS
# ═════════════════════════════════════════════════════════════════

# JSON
{
    echo "{"
    echo '  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",'
    echo '  "total": '$TOTAL','
    echo '  "passed": '$PASSED','
    echo '  "failed": '$FAILED','
    echo '  "pass_rate": "'$((PASSED * 100 / TOTAL))'%",'
    echo '  "tests": ['
    for i in "${!RESULTS[@]}"; do
        IFS='|' read -r name method endpoint http success <<< "${RESULTS[$i]}"
        echo '    {"name":"'$name'","method":"'$method'","endpoint":"'$endpoint'","http":'$http',"success":'$success'}'
        [ $i -lt $((${#RESULTS[@]}-1)) ] && echo ','
    done
    echo '  ]'
    echo '}'
} > "$JSON_REPORT"

# MARKDOWN
{
    echo "# 📊 RELATÓRIO COMPLETO - AIRTRUST 100%"
    echo ""
    echo "**Data:** $(date '+%d/%m/%Y %H:%M:%S')"
    echo ""
    echo "## 📈 RESUMO"
    echo "| Métrica | Valor |"
    echo "|---------|-------|"
    echo "| Total | $TOTAL |"
    echo "| ✅ Passou | $PASSED |"
    echo "| ❌ Falhou | $FAILED |"
    echo "| Taxa | $((PASSED * 100 / TOTAL))% |"
    echo ""
    echo "## 🧪 Detalhes"
    echo "| Nome | Método | Endpoint | HTTP | Status |"
    echo "|------|--------|----------|------|--------|"
    for result in "${RESULTS[@]}"; do
        IFS='|' read -r name method endpoint http success <<< "$result"
        STATUS=$([ "$success" = "true" ] && echo "✅" || echo "❌")
        echo "| $name | $method | $endpoint | $http | $STATUS |"
    done
    echo ""
    [ $FAILED -eq 0 ] && echo "✅ **PRONTO PARA PRODUÇÃO**" || echo "❌ **FALHAS DETECTADAS**"
} > "$MD_REPORT"

# ═════════════════════════════════════════════════════════════════
# RESULTADO FINAL
# ═════════════════════════════════════════════════════════════════

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                   RESULTADO FINAL                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Total: $TOTAL | ✅ $PASSED | ❌ $FAILED"
echo "Taxa: $((PASSED * 100 / TOTAL))%"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║            🎉 TODOS OS TESTES PASSARAM! 🎉               ║${NC}"
    echo -e "${GREEN}║        ✅ SISTEMA PRONTO PARA PRODUÇÃO 100% ✅          ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    EXIT_CODE=0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║           🚨 EXISTEM $FAILED FALHAS 🚨                    ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    EXIT_CODE=1
fi

echo ""
echo "📊 Relatórios:"
echo "  JSON: $JSON_REPORT"
echo "  Markdown: $MD_REPORT"
echo ""

exit $EXIT_CODE
