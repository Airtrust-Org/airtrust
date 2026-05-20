#!/bin/bash
# ============================================
# AUDITORIA PROFUNDA - MÓDULO QUALIFICAÇÕES
# Versão Simplificada e Funcional
# ============================================

set +e  # Continuar mesmo com erros

# Configuração
API_BASE="https://airtrust-api-staging.airtrust.workers.dev/api"
REPORT_DATE=$(date '+%Y-%m-%d_%H-%M-%S')
REPORT_DIR="relatorios-auditoria"
REPORT_FILE="$REPORT_DIR/auditoria-qualificacoes-$REPORT_DATE"
TOKEN="${1:-eyJhbGciOiJIUzI1NiIs}"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Contadores
total_tests=0
passed_tests=0
failed_tests=0
warnings=0
critical_errors=0

declare -a test_results
declare -a recommendations

test_pass() {
  ((passed_tests++))
  ((total_tests++))
  test_results+=("PASS|$1|$2")
  echo -e "${GREEN}✅ PASS${NC} - $1"
}

test_fail() {
  ((failed_tests++))
  ((total_tests++))
  test_results+=("FAIL|$1|$2")
  echo -e "${RED}❌ FAIL${NC} - $1"
  [ "$3" == "critical" ] && ((critical_errors++))
}

test_warn() {
  ((warnings++))
  ((total_tests++))
  test_results+=("WARN|$1|$2")
  echo -e "${YELLOW}⚠️  WARN${NC} - $1"
}

add_recommendation() {
  recommendations+=("$1")
}

print_section() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

print_subsection() {
  echo ""
  echo -e "${BLUE}▶ $1${NC}"
  echo -e "${BLUE}──────────────────────────────────────────────────────${NC}"
}

mkdir -p "$REPORT_DIR"

clear
echo -e "${MAGENTA}"
cat << 'BANNER'
╔══════════════════════════════════════════════════════════════════╗
║           AUDITORIA PROFUNDA - MÓDULO QUALIFICAÇÕES             ║
╚══════════════════════════════════════════════════════════════════╝
BANNER
echo -e "${NC}"
echo "🔍 Iniciando auditoria completa..."
echo "📅 Data: $(date '+%d/%m/%Y %H:%M:%S')"
echo "🌐 API: $API_BASE"
echo "🔑 Token: ${TOKEN:0:20}..."
echo ""

# ============================================
# SEÇÃO 1: ANÁLISE DE ESTRUTURA
# ============================================
print_section "1. ANÁLISE DE ESTRUTURA DE ARQUIVOS"

print_subsection "1.1 Backend - Estrutura do Worker"

check_file() {
  local file="$1"
  local desc="$2"
  local optional="$3"
  
  if [ -f "$file" ]; then
    local size=$(wc -l "$file" 2>/dev/null | awk '{print $1}')
    test_pass "Backend: $(basename "$file")" "Arquivo existe ($size linhas). $desc"
  else
    if [ "$optional" = "yes" ]; then
      test_warn "Backend: $(basename "$file")" "Arquivo não encontrado (opcional). $desc"
    else
      test_fail "Backend: $(basename "$file")" "Arquivo FALTANDO. $desc" "critical"
    fi
  fi
}

check_file "worker-airtrust/src/index.ts" "Arquivo principal do Worker" "no"
check_file "worker-airtrust/src/routes/qualificacoes.ts" "Rotas de qualificações" "no"
check_file "worker-airtrust/src/routes/pasta-virtual.ts" "Rotas de pasta virtual" "no"
check_file "worker-airtrust/src/middleware/auth.ts" "Middleware de autenticação" "yes"
check_file "worker-airtrust/wrangler.toml" "Configuração do Wrangler" "no"
check_file "worker-airtrust/package.json" "Dependências do backend" "no"

print_subsection "1.2 Frontend - Estrutura React"

check_frontend_file() {
  local file="$1"
  local desc="$2"
  local optional="$3"
  
  if [ -f "$file" ]; then
    local size=$(wc -l "$file" 2>/dev/null | awk '{print $1}')
    test_pass "Frontend: $(basename "$file")" "Arquivo existe ($size linhas). $desc"
  else
    if [ "$optional" = "yes" ]; then
      test_warn "Frontend: $(basename "$file")" "Arquivo não encontrado (opcional). $desc"
    else
      test_fail "Frontend: $(basename "$file")" "Arquivo FALTANDO. $desc"
    fi
  fi
}

check_frontend_file "react-app/src/pages/Qualificacoes.tsx" "Página principal de qualificações" "no"
check_frontend_file "react-app/src/components/modals/ModalAtribuirQualificacao.tsx" "Modal de atribuir qualificação" "yes"
check_frontend_file "react-app/src/components/modals/ModalCertificado.tsx" "Modal de certificados" "yes"
check_frontend_file "react-app/src/pages/PastaVirtual.tsx" "Página de pasta virtual" "no"
check_frontend_file "react-app/src/config/api.ts" "Configuração da API" "no"

# ============================================
# SEÇÃO 2: TESTES DE ENDPOINTS
# ============================================
print_section "2. TESTES EXAUSTIVOS DE ENDPOINTS"

print_subsection "2.1 Endpoints de Leitura (GET)"

test_get_endpoint() {
  local name="$1"
  local endpoint="$2"
  local expected_status="$3"
  
  echo "🔍 Testando: GET $endpoint"
  
  local start_time=$(python3 -c "import time; print(int(time.time() * 1000))")
  local temp_file=$(mktemp)
  curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE$endpoint" > "$temp_file" 2>/dev/null
  local end_time=$(python3 -c "import time; print(int(time.time() * 1000))")
  
  local status=$(tail -n 1 "$temp_file")
  local body=$(sed '$d' "$temp_file")
  local duration=$(( end_time - start_time ))
  rm -f "$temp_file"
  
  if [ "$status" = "$expected_status" ]; then
    test_pass "$name - Status Code" "HTTP $status em ${duration}ms"
  elif [ "$status" = "401" ]; then
    test_warn "$name - Status Code" "HTTP 401 - Requer autenticação"
  else
    test_fail "$name - Status Code" "HTTP $status (esperado: $expected_status)"
  fi
  
  if [ $duration -lt 200 ]; then
    test_pass "$name - Performance" "Excelente: ${duration}ms"
  elif [ $duration -lt 500 ]; then
    test_pass "$name - Performance" "Bom: ${duration}ms"
  elif [ $duration -lt 1000 ]; then
    test_warn "$name - Performance" "Aceitável: ${duration}ms"
  else
    test_fail "$name - Performance" "LENTO: ${duration}ms"
  fi
  
  if echo "$body" | python3 -m json.tool > /dev/null 2>&1; then
    test_pass "$name - JSON" "Response é JSON válido"
  else
    test_fail "$name - JSON" "Response NÃO é JSON válido"
  fi
}

test_get_endpoint "Listar Tipos" "/qualificacoes/tipos?limit=10" "200"
test_get_endpoint "Listar Histórico" "/qualificacoes/historico?limit=10&page=1" "200"
test_get_endpoint "Listar Categorias" "/categorias" "200"
test_get_endpoint "Listar Funcionários" "/funcionarios-ssot?status=ATIVO&limit=10" "200"

print_subsection "2.2 Endpoints de Escrita (POST, PUT, DELETE)"

echo "📝 POST /qualificacoes/historico"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/qualificacoes/historico" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"test":"dry-run"}' 2>/dev/null)

if [ "$STATUS" = "400" ] || [ "$STATUS" = "422" ]; then
  test_pass "POST Criar Qualificação" "Endpoint valida dados (HTTP $STATUS)"
elif [ "$STATUS" = "201" ]; then
  test_pass "POST Criar Qualificação" "Endpoint funcionando (HTTP 201)"
elif [ "$STATUS" = "401" ]; then
  test_warn "POST Criar Qualificação" "Requer autenticação (HTTP 401)"
elif [ "$STATUS" = "404" ]; then
  test_fail "POST Criar Qualificação" "Endpoint NÃO implementado (HTTP 404)" "critical"
else
  test_fail "POST Criar Qualificação" "Erro inesperado (HTTP $STATUS)"
fi

echo "✏️  PUT /qualificacoes/historico/1"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$API_BASE/qualificacoes/historico/1" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"test":"dry-run"}' 2>/dev/null)

if [ "$STATUS" = "200" ] || [ "$STATUS" = "400" ] || [ "$STATUS" = "422" ]; then
  test_pass "PUT Editar Qualificação" "Endpoint implementado (HTTP $STATUS)"
elif [ "$STATUS" = "401" ]; then
  test_warn "PUT Editar Qualificação" "Requer autenticação"
else
  test_warn "PUT Editar Qualificação" "Status: HTTP $STATUS"
fi

echo "🗑️  DELETE /qualificacoes/historico/999999"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_BASE/qualificacoes/historico/999999" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)

if [ "$STATUS" = "200" ] || [ "$STATUS" = "404" ]; then
  test_pass "DELETE Qualificação" "Endpoint implementado (HTTP $STATUS)"
elif [ "$STATUS" = "401" ]; then
  test_warn "DELETE Qualificação" "Requer autenticação"
fi

# ============================================
# SEÇÃO 3: FILTROS E PAGINAÇÃO
# ============================================
print_section "3. TESTES DE FILTROS E PAGINAÇÃO"

print_subsection "3.1 Paginação"

for page in 1 2 3; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
    "$API_BASE/qualificacoes/historico?page=$page&limit=10" 2>/dev/null)
  if [ "$STATUS" = "200" ]; then
    test_pass "Paginação - Página $page" "Funciona (HTTP $STATUS)"
  else
    test_warn "Paginação - Página $page" "HTTP $STATUS"
  fi
done

print_subsection "3.2 Filtros"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/qualificacoes/historico?categoria=1" 2>/dev/null)
[ "$STATUS" = "200" ] && test_pass "Filtro por categoria" "Funciona" || test_warn "Filtro por categoria" "HTTP $STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
  "$API_BASE/qualificacoes/historico?status=VALIDO" 2>/dev/null)
[ "$STATUS" = "200" ] && test_pass "Filtro por status" "Funciona" || test_warn "Filtro por status" "HTTP $STATUS"

# ============================================
# SEÇÃO 4: SEGURANÇA
# ============================================
print_section "4. ANÁLISE DE SEGURANÇA"

print_subsection "4.1 Autenticação"

STATUS_NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE/qualificacoes/historico" 2>/dev/null)

if [ "$STATUS_NO_AUTH" = "401" ] || [ "$STATUS_NO_AUTH" = "403" ]; then
  test_pass "Autenticação" "Endpoints protegidos (HTTP $STATUS_NO_AUTH)"
elif [ "$STATUS_NO_AUTH" = "200" ]; then
  test_fail "Autenticação" "CRÍTICO: Endpoints DESPROTEGIDOS!" "critical"
  add_recommendation "URGENTE: Adicionar middleware de autenticação"
else
  test_warn "Autenticação" "Status inesperado: HTTP $STATUS_NO_AUTH"
fi

print_subsection "4.2 CORS"

HEADERS=$(curl -s -I "$API_BASE/qualificacoes/tipos" 2>/dev/null)
echo "$HEADERS" | grep -qi "access-control-allow-origin" && \
  test_pass "CORS" "Configurado" || test_warn "CORS" "Pode não estar configurado"

# ============================================
# SEÇÃO 5: PERFORMANCE
# ============================================
print_section "5. ANÁLISE DE PERFORMANCE"

echo "⚡ Medindo tempos de resposta..."

measure_perf() {
  local name="$1"
  local endpoint="$2"
  
  START=$(python3 -c "import time; print(int(time.time() * 1000))")
  curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE$endpoint" > /dev/null 2>&1
  END=$(python3 -c "import time; print(int(time.time() * 1000))")
  DURATION=$(( END - START ))
  
  if [ $DURATION -lt 200 ]; then
    test_pass "$name - Performance" "Excelente: ${DURATION}ms"
  elif [ $DURATION -lt 500 ]; then
    test_pass "$name - Performance" "Bom: ${DURATION}ms"
  elif [ $DURATION -lt 1000 ]; then
    test_warn "$name - Performance" "Aceitável: ${DURATION}ms"
  else
    test_fail "$name - Performance" "LENTO: ${DURATION}ms"
    add_recommendation "Otimizar query: $endpoint"
  fi
}

measure_perf "Listar Tipos (perf)" "/qualificacoes/tipos?limit=10"
measure_perf "Listar Histórico (perf)" "/qualificacoes/historico?limit=50"
measure_perf "Listar Categorias (perf)" "/categorias"

# ============================================
# RELATÓRIO FINAL
# ============================================
print_section "RELATÓRIO FINAL"

if [ $total_tests -gt 0 ]; then
  success_rate=$(( passed_tests * 100 / total_tests ))
  fail_rate=$(( failed_tests * 100 / total_tests ))
  warn_rate=$(( warnings * 100 / total_tests ))
else
  success_rate=0
  fail_rate=0
  warn_rate=0
fi

if [ $critical_errors -gt 0 ]; then
  OVERALL_STATUS="CRÍTICO"
  STATUS_COLOR=$RED
elif [ $failed_tests -gt 5 ]; then
  OVERALL_STATUS="FALHOU"
  STATUS_COLOR=$RED
elif [ $warnings -gt 10 ]; then
  OVERALL_STATUS="ATENÇÃO"
  STATUS_COLOR=$YELLOW
elif [ $failed_tests -eq 0 ]; then
  OVERALL_STATUS="EXCELENTE"
  STATUS_COLOR=$GREEN
else
  OVERALL_STATUS="BOM"
  STATUS_COLOR=$GREEN
fi

# Gerar relatório Markdown
cat > "${REPORT_FILE}.md" << MD_START
# 🔍 Relatório de Auditoria - Módulo Qualificações

**Data:** $(date '+%d/%m/%Y %H:%M:%S')  
**Sistema:** AirTrust  
**Módulo:** Qualificações e Certificações  

---

## 📊 Sumário Executivo

| Métrica | Valor | Percentual |
|---------|-------|------------|
| **Total de Testes** | ${total_tests} | 100% |
| **✅ Testes Passados** | ${passed_tests} | ${success_rate}% |
| **⚠️  Avisos** | ${warnings} | ${warn_rate}% |
| **❌ Falhas** | ${failed_tests} | ${fail_rate}% |
| **🔴 Erros Críticos** | ${critical_errors} | - |

### Status Geral: **${OVERALL_STATUS}**

**Taxa de Sucesso:** ${success_rate}% ($passed_tests de $total_tests testes)

---

## 📋 Resultados Detalhados

MD_START

for result in "${test_results[@]}"; do
  IFS='|' read -r status test_name description <<< "$result"
  icon="✅"
  [ "$status" = "FAIL" ] && icon="❌"
  [ "$status" = "WARN" ] && icon="⚠️"
  
  echo "### $icon $test_name" >> "${REPORT_FILE}.md"
  echo "$description" >> "${REPORT_FILE}.md"
  echo "" >> "${REPORT_FILE}.md"
done

if [ ${#recommendations[@]} -gt 0 ]; then
  echo "## 💡 Recomendações" >> "${REPORT_FILE}.md"
  echo "" >> "${REPORT_FILE}.md"
  for rec in "${recommendations[@]}"; do
    echo "- $rec" >> "${REPORT_FILE}.md"
  done
fi

cat >> "${REPORT_FILE}.md" << 'MD_END'

---

**Gerado por:** Auditoria Profunda AirTrust v2.0  
MD_END

# Exibir resumo
echo ""
echo -e "${STATUS_COLOR}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                  AUDITORIA FINALIZADA                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo ""
echo "📊 Estatísticas Finais:"
echo "   Total de testes: $total_tests"
echo -e "   ${GREEN}Sucessos: $passed_tests ($success_rate%)${NC}"
echo -e "   ${YELLOW}Avisos: $warnings ($warn_rate%)${NC}"
echo -e "   ${RED}Falhas: $failed_tests ($fail_rate%)${NC}"
echo -e "   ${RED}Erros Críticos: $critical_errors${NC}"
echo ""
echo -e "📈 Status Geral: ${STATUS_COLOR}${OVERALL_STATUS}${NC}"
echo ""
echo "📁 Relatório gerado:"
echo "   📝 ${REPORT_FILE}.md"
echo ""
echo "🌐 Para visualizar:"
echo "   $ cat ${REPORT_FILE}.md"
echo ""

if [ $critical_errors -gt 0 ]; then
  echo -e "${RED}⚠️  ATENÇÃO: ${critical_errors} erros críticos encontrados!${NC}"
  echo ""
fi

if [ ${#recommendations[@]} -gt 0 ]; then
  echo "💡 Recomendações:"
  for rec in "${recommendations[@]}"; do
    echo "   • $rec"
  done
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Auditoria concluída: $(date '+%d/%m/%Y %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
