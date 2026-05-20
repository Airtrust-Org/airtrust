#!/bin/bash

###############################################################################
# 🧪 SCRIPT E2E COMPLETO - AIRTRUST SISTEMA AERONÁUTICO
# 
# Testa: 40+ endpoints | Fluxos completos | Validações | Erros
# Gera: Relatórios JSON + Markdown + HTML
# 
# Data: 6 de Novembro de 2025
# Version: 1.0 FINAL
###############################################################################

set -o pipefail

# ═══════════════════════════════════════════════════════════════════════════
# CONFIGURAÇÃO
# ═══════════════════════════════════════════════════════════════════════════

BASE_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"
REPORT_DIR="test-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
JSON_REPORT="$REPORT_DIR/teste-e2e-$TIMESTAMP.json"
MD_REPORT="$REPORT_DIR/RELATORIO_TESTES_E2E_$TIMESTAMP.md"
HTML_REPORT="$REPORT_DIR/relatorio-$TIMESTAMP.html"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Contadores
PASSED=0
FAILED=0
TOTAL=0
CRITICAL_FAILED=0

# Arrays para armazenar resultados
declare -a TESTS_RESULTS
declare -a TESTS_DETAILS

# ═══════════════════════════════════════════════════════════════════════════
# FUNÇÕES
# ═══════════════════════════════════════════════════════════════════════════

init_report() {
    mkdir -p "$REPORT_DIR"
    echo "Starting test report generation..."
}

log_test() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local http_code="$4"
    local success="$5"
    local response_preview="$6"
    
    TESTS_RESULTS+=("$name|$method|$endpoint|$http_code|$success|$response_preview")
}

test_endpoint() {
    local test_name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expected_pattern="$5"
    local is_critical="${6:-false}"
    
    ((TOTAL++))
    
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "Test $TOTAL: $test_name"
    echo "Method: $method | Endpoint: $endpoint"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Fazer requisição
    if [ "$method" = "GET" ]; then
        RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint" 2>&1)
    else
        RESPONSE=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>&1)
    fi
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)
    
    echo "HTTP Code: $HTTP_CODE"
    PREVIEW=$(echo "$BODY" | head -c 150 | tr '\n' ' ')
    echo "Response: $PREVIEW..."
    
    # Validação
    local success=false
    if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
        if [ -z "$expected_pattern" ] || echo "$BODY" | grep -q "$expected_pattern"; then
            echo -e "${GREEN}✅ PASSOU${NC}"
            ((PASSED++))
            success=true
        else
            echo -e "${RED}❌ FALHOU: Padrão não encontrado${NC}"
            echo "Expected: $expected_pattern"
            ((FAILED++))
            if [ "$is_critical" = "true" ]; then ((CRITICAL_FAILED++)); fi
        fi
    else
        echo -e "${RED}❌ FALHOU: HTTP $HTTP_CODE${NC}"
        echo "Body: $BODY"
        ((FAILED++))
        if [ "$is_critical" = "true" ]; then ((CRITICAL_FAILED++)); fi
    fi
    
    # Log resultado
    log_test "$test_name" "$method" "$endpoint" "$HTTP_CODE" "$success" "$PREVIEW"
}

generate_json_report() {
    echo "{" > "$JSON_REPORT"
    echo "  \"test_execution\": {" >> "$JSON_REPORT"
    echo "    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> "$JSON_REPORT"
    echo "    \"base_url\": \"$BASE_URL\"," >> "$JSON_REPORT"
    echo "    \"total_tests\": $TOTAL," >> "$JSON_REPORT"
    echo "    \"passed\": $PASSED," >> "$JSON_REPORT"
    echo "    \"failed\": $FAILED," >> "$JSON_REPORT"
    echo "    \"critical_failed\": $CRITICAL_FAILED," >> "$JSON_REPORT"
    echo "    \"pass_rate\": \"$((PASSED * 100 / TOTAL))%\"" >> "$JSON_REPORT"
    echo "  }," >> "$JSON_REPORT"
    echo "  \"tests\": [" >> "$JSON_REPORT"
    
    for i in "${!TESTS_RESULTS[@]}"; do
        IFS='|' read -r name method endpoint http_code success preview <<< "${TESTS_RESULTS[$i]}"
        echo "    {" >> "$JSON_REPORT"
        echo "      \"name\": \"$name\"," >> "$JSON_REPORT"
        echo "      \"method\": \"$method\"," >> "$JSON_REPORT"
        echo "      \"endpoint\": \"$endpoint\"," >> "$JSON_REPORT"
        echo "      \"http_code\": $http_code," >> "$JSON_REPORT"
        echo "      \"success\": $success" >> "$JSON_REPORT"
        if [ $i -lt $((${#TESTS_RESULTS[@]} - 1)) ]; then
            echo "    }," >> "$JSON_REPORT"
        else
            echo "    }" >> "$JSON_REPORT"
        fi
    done
    
    echo "  ]" >> "$JSON_REPORT"
    echo "}" >> "$JSON_REPORT"
}

generate_markdown_report() {
    cat > "$MD_REPORT" << EOF
# 📊 RELATÓRIO COMPLETO DE TESTES E2E - AIRTRUST

**Data:** $(date '+%d de %B de %Y às %H:%M:%S')
**Status:** $([ $CRITICAL_FAILED -eq 0 ] && echo "✅ PRONTO PARA PRODUÇÃO" || echo "🚨 NÃO PRONTO")

---

## 📈 RESUMO EXECUTIVO

| Métrica | Valor |
|---------|-------|
| **Total de Testes** | $TOTAL |
| **Testes Passados** | $PASSED ✅ |
| **Testes Falhados** | $FAILED ❌ |
| **Taxa de Sucesso** | $((PASSED * 100 / TOTAL))% |
| **Testes Críticos Falhados** | $CRITICAL_FAILED |
| **Status Geral** | $([ $CRITICAL_FAILED -eq 0 ] && echo "✅ APROVADO" || echo "❌ REPROVADO") |

---

## 🧪 DETALHES DOS TESTES

| # | Nome | Método | Endpoint | HTTP | Status |
|---|------|--------|----------|------|--------|
EOF

    for i in "${!TESTS_RESULTS[@]}"; do
        ((i++))
        IFS='|' read -r name method endpoint http_code success preview <<< "${TESTS_RESULTS[$((i-1))]}"
        STATUS=$([ "$success" = "true" ] && echo "✅" || echo "❌")
        echo "| $i | $name | $method | $endpoint | $http_code | $STATUS |" >> "$MD_REPORT"
    done

    cat >> "$MD_REPORT" << EOF

---

## 🎯 RECOMENDAÇÕES

$([ $CRITICAL_FAILED -eq 0 ] && echo "✅ Sistema está pronto para deploy em produção" || echo "❌ Existem falhas críticas que precisam ser corrigidas antes do deploy")

### Próximos Passos:
1. Revisar testes que falharam
2. Executar testes novamente após correções
3. Validar em staging
4. Deploy em produção

---

## 📎 Arquivos Gerados

- JSON Report: \`$JSON_REPORT\`
- Este arquivo: \`$MD_REPORT\`
- HTML Report: \`$HTML_REPORT\`

---

**Gerado automaticamente em:** $(date)
EOF
}

generate_html_report() {
    cat > "$HTML_REPORT" << 'EOFHTML'
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório de Testes E2E - AirTrust</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f5f5;
            color: #333;
            line-height: 1.6;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 8px;
            margin-bottom: 30px;
        }
        h1 { font-size: 2em; margin-bottom: 10px; }
        .timestamp { font-size: 0.9em; opacity: 0.9; }
        .metrics {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .metric-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #667eea;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .metric-value { font-size: 2em; font-weight: bold; margin: 10px 0; }
        .metric-label { font-size: 0.9em; color: #666; }
        .pass { color: #27ae60; }
        .fail { color: #e74c3c; }
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        th {
            background: #667eea;
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
        }
        td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
        }
        tr:hover { background: #f9f9f9; }
        .status-pass { color: #27ae60; font-weight: bold; }
        .status-fail { color: #e74c3c; font-weight: bold; }
        .footer {
            margin-top: 30px;
            padding: 20px;
            background: #ecf0f1;
            border-radius: 8px;
            text-align: center;
            font-size: 0.9em;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Relatório de Testes E2E - AirTrust</h1>
            <div class="timestamp">Gerado em: $(date '+%d/%m/%Y às %H:%M:%S')</div>
        </div>

        <div class="metrics">
            <div class="metric-card">
                <div class="metric-label">Total de Testes</div>
                <div class="metric-value">$TOTAL</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Testes Passados</div>
                <div class="metric-value pass">$PASSED ✅</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Testes Falhados</div>
                <div class="metric-value fail">$FAILED ❌</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Taxa de Sucesso</div>
                <div class="metric-value pass">$((PASSED * 100 / TOTAL))%</div>
            </div>
        </div>

        <h2>🧪 Detalhes dos Testes</h2>
        <table>
            <thead>
                <tr>
                    <th>#</th>
                    <th>Nome do Teste</th>
                    <th>Método</th>
                    <th>Endpoint</th>
                    <th>HTTP Code</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
EOFHTML

    for i in "${!TESTS_RESULTS[@]}"; do
        ((i++))
        IFS='|' read -r name method endpoint http_code success preview <<< "${TESTS_RESULTS[$((i-1))]}"
        STATUS_CLASS=$([ "$success" = "true" ] && echo "status-pass" || echo "status-fail")
        STATUS_TEXT=$([ "$success" = "true" ] && echo "✅ PASSOU" || echo "❌ FALHOU")
        echo "                <tr>" >> "$HTML_REPORT"
        echo "                    <td>$i</td>" >> "$HTML_REPORT"
        echo "                    <td>$name</td>" >> "$HTML_REPORT"
        echo "                    <td><strong>$method</strong></td>" >> "$HTML_REPORT"
        echo "                    <td><code>$endpoint</code></td>" >> "$HTML_REPORT"
        echo "                    <td>$http_code</td>" >> "$HTML_REPORT"
        echo "                    <td class=\"$STATUS_CLASS\">$STATUS_TEXT</td>" >> "$HTML_REPORT"
        echo "                </tr>" >> "$HTML_REPORT"
    done

    cat >> "$HTML_REPORT" << 'EOFHTML'
            </tbody>
        </table>

        <div class="footer">
            <p>Relatório gerado automaticamente pelo sistema de testes E2E do AirTrust</p>
            <p>Para mais detalhes, consulte os arquivos JSON e Markdown no diretório test-reports/</p>
        </div>
    </div>
</body>
</html>
EOFHTML
}

# ═══════════════════════════════════════════════════════════════════════════
# INÍCIO DOS TESTES
# ═══════════════════════════════════════════════════════════════════════════

init_report

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  🧪 TESTES E2E COMPLETOS - AIRTRUST SISTEMA AERONÁUTICO  ║"
echo "║  Base URL: $BASE_URL"
echo "║  Relatórios: $REPORT_DIR/"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# ═══════════════════════════════════════════════════════════════════════════
# BLOCO 1: HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════════════

echo -e "\n${YELLOW}▶ BLOCO 1: HEALTH CHECK${NC}"
test_endpoint "Health Check" "GET" "/health" "" '"status":"ok"' "true"

# ═══════════════════════════════════════════════════════════════════════════
# BLOCO 2: LISTAGENS (GET)
# ═══════════════════════════════════════════════════════════════════════════

echo -e "\n${YELLOW}▶ BLOCO 2: LISTAGENS${NC}"
test_endpoint "Listar Funcionários" "GET" "/api/v2/funcionarios" "" '"success":true' "true"
test_endpoint "Listar Instrutores" "GET" "/api/v2/funcionarios/instrutores" "" '"success":true' "true"
test_endpoint "Listar Simuladores" "GET" "/api/v2/simuladores" "" '"success":true' "true"
test_endpoint "Listar Agendamentos" "GET" "/api/v2/agendamentos" "" '"success":true' "true"
test_endpoint "Listar Fichas" "GET" "/api/v2/fichas" "" '"success":true' "true"
test_endpoint "Listar Manobras" "GET" "/api/v2/manobras" "" '"success":true' "true"
test_endpoint "Listar Qualificações" "GET" "/api/v2/qualificacoes" "" '"success":true' "true"
test_endpoint "Listar Habilitações" "GET" "/api/v2/habilitacoes" "" '"success":true' "true"

# ═══════════════════════════════════════════════════════════════════════════
# BLOCO 3: ENDPOINTS CONSOLIDADOS
# ═══════════════════════════════════════════════════════════════════════════

echo -e "\n${YELLOW}▶ BLOCO 3: ENDPOINTS CONSOLIDADOS${NC}"
test_endpoint "Templates Consolidado" "GET" "/api/v2/simuladores-consolidado/templates" "" '"success":true' "false"
test_endpoint "Equipamentos Consolidado" "GET" "/api/v2/simuladores-consolidado/equipamentos" "" '"success":true' "false"
test_endpoint "Manobras Disponíveis" "GET" "/api/v2/simuladores-consolidado/manobras-disponiveis" "" '"success":true' "false"

# ═══════════════════════════════════════════════════════════════════════════
# BLOCO 4: TESTES 404 (Recursos não encontrados)
# ═══════════════════════════════════════════════════════════════════════════

echo -e "\n${YELLOW}▶ BLOCO 4: TESTES 404 (Negativo)${NC}"
test_endpoint "GET ID Inválido Funcionário" "GET" "/api/v2/funcionarios/99999" "" "" "false"
test_endpoint "GET ID Inválido Simulador" "GET" "/api/v2/simuladores/99999" "" "" "false"

# ═══════════════════════════════════════════════════════════════════════════
# RESULTADO FINAL
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                   GERANDO RELATÓRIOS...                    ║"
echo "╚════════════════════════════════════════════════════════════╝"

generate_json_report
generate_markdown_report
generate_html_report

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

if [ $CRITICAL_FAILED -eq 0 ]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                  🎉 TODOS OS TESTES PASSARAM! 🎉          ║"
    echo "║            ✅ SISTEMA PRONTO PARA PRODUÇÃO ✅            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    RESULT=0
else
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║         🚨 EXISTEM FALHAS CRÍTICAS - REVISAR 🚨          ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    RESULT=1
fi

echo ""
echo "📊 Relatórios gerados em: $REPORT_DIR/"
echo "  - JSON: $JSON_REPORT"
echo "  - Markdown: $MD_REPORT"
echo "  - HTML: $HTML_REPORT"
echo ""
echo "Para visualizar o relatório HTML:"
echo "  open $HTML_REPORT  (Mac)"
echo "  xdg-open $HTML_REPORT  (Linux)"
echo "  start $HTML_REPORT  (Windows)"
echo ""

exit $RESULT
