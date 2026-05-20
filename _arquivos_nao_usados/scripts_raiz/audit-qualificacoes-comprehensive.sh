#!/bin/bash
# AUDITORIA ABRANGENTE COMPLETA - MÓDULO QUALIFICAÇÕES
# Cobertura: Endpoints, Payloads, Segurança, Performance, Integração
set -e

API_BASE="https://airtrust-api-staging.airtrust.workers.dev/api"
TOKEN="${1:-}"
TS=$(date '+%Y%m%d_%H%M%S')
REPORT_DIR="relatorios-auditoria"
mkdir -p "$REPORT_DIR"
LOG_FILE="$REPORT_DIR/audit-comprehensive-$TS.log"

# Contadores
total=0; pass=0; fail=0; warn=0; skip=0; crit=0
RESULTS=()

# Funções de log
log_pass() { echo "✅ PASS - $1" | tee -a "$LOG_FILE"; RESULTS+=("PASS|$1|${2:-}"); pass=$((pass+1)); total=$((total+1)); }
log_fail() { echo "❌ FAIL - $1" | tee -a "$LOG_FILE"; RESULTS+=("FAIL|$1|${2:-}"); fail=$((fail+1)); total=$((total+1)); [ "${3:-}" = "critical" ] && crit=$((crit+1)); }
log_warn() { echo "⚠️  WARN - $1" | tee -a "$LOG_FILE"; RESULTS+=("WARN|$1|${2:-}"); warn=$((warn+1)); total=$((total+1)); }
log_skip() { echo "⏭️  SKIP - $1" | tee -a "$LOG_FILE"; RESULTS+=("SKIP|$1|${2:-}"); skip=$((skip+1)); total=$((total+1)); }
section() { echo ""; echo "========== $1 ==========" | tee -a "$LOG_FILE"; }

# Função HTTP request genérica
http_req() {
  local method="$1" endpoint="$2" expected="$3" label="$4" data="${5:-}" max_ms="${6:-1000}"
  local start=$(python3 -c "import time;print(int(time.time()*1000))")
  local tmp=$(mktemp)
  
  if [ "$method" = "GET" ]; then
    if [ -n "$TOKEN" ]; then
      curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE$endpoint" > "$tmp" 2>&1 || true
    else
      curl -s -w "\n%{http_code}" "$API_BASE$endpoint" > "$tmp" 2>&1 || true
    fi
  else
    if [ -n "$TOKEN" ]; then
      curl -s -X "$method" -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$data" "$API_BASE$endpoint" > "$tmp" 2>&1 || true
    else
      curl -s -X "$method" -w "\n%{http_code}" -H "Content-Type: application/json" -d "$data" "$API_BASE$endpoint" > "$tmp" 2>&1 || true
    fi
  fi
  
  local end=$(python3 -c "import time;print(int(time.time()*1000))")
  local status=$(tail -n1 "$tmp")
  local body=$(sed '$d' "$tmp")
  local dur=$((end-start))
  rm -f "$tmp"
  
  # Validar status
  if [[ "$status" =~ ^($expected)$ ]]; then
    log_pass "$label - Status" "HTTP $status (${dur}ms)"
  else
    log_fail "$label - Status" "HTTP $status (esperado $expected)" "${7:-}"
  fi
  
  # Validar performance
  if [ "$dur" -le "$max_ms" ]; then
    log_pass "$label - Performance" "${dur}ms <= ${max_ms}ms"
  elif [ "$dur" -le $((max_ms*2)) ]; then
    log_warn "$label - Performance" "${dur}ms (lento)"
  else
    log_fail "$label - Performance" "${dur}ms (crítico > ${max_ms}ms)"
  fi
  
  # Validar JSON (se status OK)
  if [[ "$status" =~ ^(200|201)$ ]]; then
    if echo "$body" | python3 -m json.tool >/dev/null 2>&1; then
      log_pass "$label - JSON" "válido"
      
      # Validar estrutura resposta
      if echo "$body" | grep -q '"success"'; then
        log_pass "$label - Padrão" "{ success } presente"
      else
        log_warn "$label - Padrão" "Estrutura sem 'success'"
      fi
    else
      log_fail "$label - JSON" "inválido"
    fi
  fi
  
  echo "$status|$dur|$body"
}

# Início da auditoria
section "AUDITORIA ABRANGENTE - MÓDULO QUALIFICAÇÕES"
echo "Data: $(date)" | tee -a "$LOG_FILE"
echo "Ambiente: $API_BASE" | tee -a "$LOG_FILE"
echo "Token: ${TOKEN:+Presente}${TOKEN:-Ausente}" | tee -a "$LOG_FILE"

# ====================
# 1. PROTEÇÃO E AUTENTICAÇÃO
# ====================
section "1. PROTEÇÃO E AUTENTICAÇÃO"

# Testes sem token
for endpoint in "/qualificacoes/tipos" "/qualificacoes/historico" "/funcionarios-ssot"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE$endpoint" 2>&1 || echo "000")
  if [[ "$status" =~ ^(401|403)$ ]]; then
    log_pass "Auth $endpoint" "Protegido ($status)"
  else
    log_fail "Auth $endpoint" "Desprotegido ($status)" "critical"
  fi
done

# ====================
# 2. ENDPOINTS GET - LEITURA
# ====================
section "2. ENDPOINTS GET - LEITURA"

if [ -z "$TOKEN" ]; then
  log_skip "Endpoints GET" "Token ausente - pulando testes de conteúdo"
else
  # GET /tipos
  http_req "GET" "/qualificacoes/tipos?limit=10" "200" "GET /tipos" "" 500
  
  # GET /tipos com paginação
  http_req "GET" "/qualificacoes/tipos?limit=5&page=1" "200" "GET /tipos pag1" "" 500
  http_req "GET" "/qualificacoes/tipos?limit=5&page=2" "200" "GET /tipos pag2" "" 500
  
  # GET /historico
  http_req "GET" "/qualificacoes/historico?limit=10&page=1" "200" "GET /historico" "" 600
  
  # GET /historico paginação
  for p in 1 2 3; do
    http_req "GET" "/qualificacoes/historico?limit=5&page=$p" "200" "GET /historico pag$p" "" 650
  done
  
  # GET /historico com filtros
  http_req "GET" "/qualificacoes/historico?status=VALIDO" "200" "GET /historico status=VALIDO" "" 700
  http_req "GET" "/qualificacoes/historico?status=VENCIDO" "200" "GET /historico status=VENCIDO" "" 700
  http_req "GET" "/qualificacoes/historico?categoria=1" "200" "GET /historico categoria=1" "" 700
  
  # GET /historico ordenação
  http_req "GET" "/qualificacoes/historico?orderBy=data_emissao&order=DESC&limit=5" "200" "GET /historico ordenacao" "" 700
  
  # GET /historico busca
  http_req "GET" "/qualificacoes/historico?search=certificado&limit=10" "200" "GET /historico busca" "" 800
  
  # GET /categorias
  http_req "GET" "/categorias" "200" "GET /categorias" "" 400
  
  # GET /historico/:id (testando ID inexistente)
  http_req "GET" "/qualificacoes/historico/999999" "404" "GET /historico/:id inexistente" "" 500
  
  # GET /funcionarios-ssot
  http_req "GET" "/funcionarios-ssot?status=ATIVO&limit=10" "200" "GET /funcionarios-ssot" "" 600
fi

# ====================
# 3. ENDPOINTS POST - CRIAÇÃO
# ====================
section "3. ENDPOINTS POST - CRIAÇÃO"

if [ -z "$TOKEN" ]; then
  log_skip "Endpoints POST" "Token ausente"
else
  # POST payload vazio (deve falhar validação)
  http_req "POST" "/qualificacoes/historico" "400|422" "POST /historico payload vazio" '{}' 800
  
  # POST payload incompleto
  http_req "POST" "/qualificacoes/historico" "400|422" "POST /historico incompleto" '{"funcionario_id":1}' 800
  
  # POST payload com tipos errados
  http_req "POST" "/qualificacoes/historico" "400|422" "POST /historico tipos errados" '{"funcionario_id":"abc","tipo_id":"xyz"}' 800
fi

# ====================
# 4. ENDPOINTS PUT - ATUALIZAÇÃO
# ====================
section "4. ENDPOINTS PUT - ATUALIZAÇÃO"

if [ -z "$TOKEN" ]; then
  log_skip "Endpoints PUT" "Token ausente"
else
  # PUT ID inexistente (deve retornar 404)
  http_req "PUT" "/qualificacoes/historico/999999" "404" "PUT /historico ID inexistente" '{"observacoes":"teste"}' 800
  
  # PUT payload vazio
  http_req "PUT" "/qualificacoes/historico/1" "400|422|404" "PUT /historico payload vazio" '{}' 800
  
  # PUT tipos ID inexistente
  http_req "PUT" "/qualificacoes/tipos/999999" "404" "PUT /tipos ID inexistente" '{"nome":"teste"}' 800
fi

# ====================
# 5. ENDPOINTS DELETE - SOFT DELETE
# ====================
section "5. ENDPOINTS DELETE - SOFT DELETE"

if [ -z "$TOKEN" ]; then
  log_skip "Endpoints DELETE" "Token ausente"
else
  # DELETE ID inexistente (soft delete deve retornar 404 ou 200)
  http_req "DELETE" "/qualificacoes/historico/999999" "200|404" "DELETE /historico ID inexistente" "" 800
fi

# ====================
# 6. SEGURANÇA - INJECTION
# ====================
section "6. SEGURANÇA - INJECTION"

# SQL Injection attempts
if [ -n "$TOKEN" ]; then
  http_req "GET" "/qualificacoes/historico?search=' OR '1'='1" "200|400" "SQLi search param" "" 800
  http_req "GET" "/qualificacoes/historico?status='; DROP TABLE--" "200|400" "SQLi status param" "" 800
  
  # XSS attempts
  http_req "GET" "/qualificacoes/historico?search=<script>alert(1)</script>" "200|400" "XSS search param" "" 800
else
  log_skip "Testes Injection" "Token ausente"
fi

# ====================
# 7. HEADERS DE SEGURANÇA
# ====================
section "7. HEADERS DE SEGURANÇA"

headers=$(curl -s -I "$API_BASE/qualificacoes/tipos" 2>&1 || true)
for header in "X-Frame-Options" "X-Content-Type-Options" "Strict-Transport-Security"; do
  if echo "$headers" | grep -qi "$header"; then
    log_pass "Header Segurança" "$header presente"
  else
    log_warn "Header Segurança" "$header ausente"
  fi
done

# ====================
# 8. PERFORMANCE - CARGA
# ====================
section "8. PERFORMANCE - CARGA"

if [ -n "$TOKEN" ]; then
  # Teste sequencial de latência
  latencies=()
  for i in {1..10}; do
    start=$(python3 -c "import time;print(int(time.time()*1000))")
    curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/historico?limit=10" > /dev/null 2>&1 || true
    end=$(python3 -c "import time;print(int(time.time()*1000))")
    lat=$((end-start))
    latencies+=($lat)
  done
  
  # Calcular média
  sum=0
  for lat in "${latencies[@]}"; do sum=$((sum+lat)); done
  avg=$((sum/${#latencies[@]}))
  
  if [ $avg -le 300 ]; then
    log_pass "Performance Média 10 req" "${avg}ms (excelente)"
  elif [ $avg -le 600 ]; then
    log_warn "Performance Média 10 req" "${avg}ms (aceitável)"
  else
    log_fail "Performance Média 10 req" "${avg}ms (lento)"
  fi
  
  # Teste de limite alto
  start=$(python3 -c "import time;print(int(time.time()*1000))")
  curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/historico?limit=100" > /dev/null 2>&1 || true
  end=$(python3 -c "import time;print(int(time.time()*1000))")
  lat=$((end-start))
  
  if [ $lat -le 800 ]; then
    log_pass "Performance 100 registros" "${lat}ms"
  elif [ $lat -le 1500 ]; then
    log_warn "Performance 100 registros" "${lat}ms"
  else
    log_fail "Performance 100 registros" "${lat}ms"
  fi
else
  log_skip "Performance Carga" "Token ausente"
fi

# ====================
# 9. ESTRUTURA DE DADOS
# ====================
section "9. ESTRUTURA DE DADOS"

if [ -n "$TOKEN" ]; then
  # Verificar campos de auditoria na resposta
  response=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/historico?limit=1" 2>&1 || true)
  
  for field in "created_at" "updated_at"; do
    if echo "$response" | grep -q "\"$field\""; then
      log_pass "Campo Auditoria" "$field presente"
    else
      log_warn "Campo Auditoria" "$field ausente"
    fi
  done
  
  # Verificar soft delete (deleted_at não deve aparecer em listagens)
  if echo "$response" | grep -q "\"deleted_at\""; then
    log_warn "Soft Delete" "deleted_at exposto na resposta"
  else
    log_pass "Soft Delete" "deleted_at oculto (correto)"
  fi
else
  log_skip "Estrutura Dados" "Token ausente"
fi

# ====================
# 10. CORS
# ====================
section "10. CORS"

cors=$(curl -s -I -H "Origin: https://example.com" "$API_BASE/qualificacoes/tipos" 2>&1 || true)
if echo "$cors" | grep -qi "Access-Control-Allow-Origin"; then
  log_pass "CORS" "Configurado"
else
  log_warn "CORS" "Não detectado"
fi

# ====================
# SUMÁRIO FINAL
# ====================
section "SUMÁRIO FINAL"

echo "Total de Testes: $total" | tee -a "$LOG_FILE"
echo "✅ Passou: $pass" | tee -a "$LOG_FILE"
echo "❌ Falhou: $fail" | tee -a "$LOG_FILE"
echo "⚠️  Avisos: $warn" | tee -a "$LOG_FILE"
echo "⏭️  Pulados: $skip" | tee -a "$LOG_FILE"
echo "🔴 Críticos: $crit" | tee -a "$LOG_FILE"

if [ $total -gt 0 ]; then
  success_rate=$((pass * 100 / total))
  echo "Taxa de Sucesso: ${success_rate}%" | tee -a "$LOG_FILE"
fi

# Determinar status geral
if [ $crit -gt 0 ]; then
  OVERALL="🔴 CRÍTICO"
elif [ $fail -gt 0 ]; then
  OVERALL="❌ REPROVADO"
elif [ $warn -gt 5 ]; then
  OVERALL="⚠️  ATENÇÃO"
else
  OVERALL="✅ APROVADO"
fi

echo "Status Geral: $OVERALL" | tee -a "$LOG_FILE"

# Gerar relatório Markdown
OUT_MD="$REPORT_DIR/AUDITORIA_COMPREHENSIVE_$TS.md"
{
  echo "# 🔍 Auditoria Abrangente Completa - Módulo Qualificações"
  echo ""
  echo "**Data:** $(date)"
  echo "**Ambiente:** $API_BASE"
  echo "**Status Geral:** $OVERALL"
  echo ""
  echo "## 📊 Sumário Estatístico"
  echo ""
  echo "| Métrica | Valor | Percentual |"
  echo "|---------|-------|------------|"
  echo "| Total | $total | 100% |"
  echo "| ✅ Passou | $pass | $((total > 0 ? pass * 100 / total : 0))% |"
  echo "| ❌ Falhou | $fail | $((total > 0 ? fail * 100 / total : 0))% |"
  echo "| ⚠️  Avisos | $warn | $((total > 0 ? warn * 100 / total : 0))% |"
  echo "| ⏭️  Pulados | $skip | $((total > 0 ? skip * 100 / total : 0))% |"
  echo "| 🔴 Críticos | $crit | $((total > 0 ? crit * 100 / total : 0))% |"
  echo ""
  echo "## 📋 Resultados Detalhados"
  echo ""
  echo "| Resultado | Teste | Detalhe |"
  echo "|-----------|-------|---------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r status name detail <<< "$r"
    echo "| $status | $name | $detail |"
  done
  echo ""
  echo "## 📝 Observações"
  echo ""
  echo "- Log completo: \`$LOG_FILE\`"
  echo "- Timestamp: $TS"
  echo ""
} > "$OUT_MD"

echo ""
echo "📄 Relatório gerado: $OUT_MD"
echo "📄 Log completo: $LOG_FILE"

# Exit code
if [ $crit -gt 0 ] || [ $fail -gt 0 ]; then
  exit 1
else
  exit 0
fi
