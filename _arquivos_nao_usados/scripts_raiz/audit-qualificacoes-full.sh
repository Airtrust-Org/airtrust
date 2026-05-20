#!/bin/bash
# AUDITORIA COMPLETA - MODULO QUALIFICACOES (AirTrust)
# Objetivo: Cobertura abrangente (estrutura, auth, funcional, segurança, performance, carga, evidências)
# Compatível com bash 3.2 (macOS). Não usa recursos avançados (associative arrays).
# Uso: ./audit-qualificacoes-full.sh <JWT_TOKEN_OPCIONAL>

set -euo pipefail
API_BASE="https://airtrust-api-staging.airtrust.workers.dev/api"
TOKEN="${1:-}" # Se vazio, testes que exigem auth serão SKIP
TS=$(date '+%Y-%m-%d_%H-%M-%S')
REPORT_DIR="relatorios-auditoria"
mkdir -p "$REPORT_DIR"
OUT_MD="$REPORT_DIR/auditoria-full-$TS.md"
OUT_HTML="$REPORT_DIR/auditoria-full-$TS.html"

pass=0; fail=0; warn=0; skip=0; crit=0; total=0
RESULTS=()

log_pass(){ echo "✅ PASS - $1"; RESULTS+=("PASS|$1|$2"); pass=$((pass+1)); total=$((total+1)); }
log_fail(){ echo "❌ FAIL - $1"; RESULTS+=("FAIL|$1|$2"); fail=$((fail+1)); total=$((total+1)); [ "${3:-}" = "critical" ] && crit=$((crit+1)); }
log_warn(){ echo "⚠️  WARN - $1"; RESULTS+=("WARN|$1|$2"); warn=$((warn+1)); total=$((total+1)); }
log_skip(){ echo "⏭️  SKIP - $1"; RESULTS+=("SKIP|$1|$2"); skip=$((skip+1)); total=$((total+1)); }

section(){ echo; echo "--- $1 ---"; }

# Realiza requisição (GET genérico) com ou sem auth
req_get(){
  local endpoint="$1"; local expect="$2"; local label="$3"; local max_ms="$4"; local auth_required="$5"
  echo "→ GET $endpoint"
  local start=$(python3 -c "import time;print(int(time.time()*1000))")
  local tmp=$(mktemp)
  if [ -n "$TOKEN" ]; then
    curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE$endpoint" > "$tmp" || true
  else
    curl -s -w "\n%{http_code}" "$API_BASE$endpoint" > "$tmp" || true
  fi
  local end=$(python3 -c "import time;print(int(time.time()*1000))")
  local status=$(tail -n1 "$tmp")
  local body=$(sed '$d' "$tmp")
  local dur=$((end-start))
  rm -f "$tmp"

  # Auth expected logic
  if [ "$auth_required" = "yes" ] && [ -z "$TOKEN" ]; then
    # Sem token: esperamos 401/403 para considerar protegido
    if [[ "$status" =~ ^(401|403)$ ]]; then log_pass "$label - Protecao" "$status"; else log_fail "$label - Protecao" "Status $status (esperado 401/403)" "critical"; fi
    log_skip "$label - Conteudo" "Sem token"
    return
  fi

  # Status
  if [ "$status" = "$expect" ]; then log_pass "$label - Status" "HTTP $status"; else log_fail "$label - Status" "HTTP $status (esperado $expect)"; fi
  # Performance
  if [ $dur -le $max_ms ]; then log_pass "$label - Performance" "${dur}ms <= ${max_ms}ms"; elif [ $dur -le $((max_ms*2)) ]; then log_warn "$label - Performance" "${dur}ms"; else log_fail "$label - Performance" "${dur}ms > ${max_ms}ms"; fi
  # JSON
  echo "$body" | python3 -m json.tool >/dev/null 2>&1 && log_pass "$label - JSON" "valido" || log_fail "$label - JSON" "invalido"
  # Excecoes/leaks
  echo "$body" | grep -qi "Exception" && log_warn "$label - Conteudo" "Leak de excecao" || log_pass "$label - Conteudo" "Limpo"
}

# Verifica proteção de endpoint sem token
check_auth_only(){
  local endpoint="$1"; local label="$2"; local st=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE$endpoint" || true)
  if [[ "$st" =~ ^(401|403)$ ]]; then log_pass "$label" "Protegido ($st)"; else log_fail "$label" "Nao protegido ($st)" "critical"; fi
}

header(){ echo "===== AUDITORIA COMPLETA QUALIFICACOES - $TS ====="; }

header
section "1. Protecao Baseline"
check_auth_only "/qualificacoes/tipos" "Auth /tipos"
check_auth_only "/qualificacoes/historico" "Auth /historico"
check_auth_only "/funcionarios-ssot" "Auth /funcionarios-ssot"

section "2. Endpoints Principais"
# GET sem token -> valida protecao; com token -> conteudo
req_get "/qualificacoes/tipos?limit=5" 200 "Listar Tipos" 400 "yes"
req_get "/qualificacoes/historico?limit=5&page=1" 200 "Listar Historico" 600 "yes"
req_get "/categorias" 200 "Listar Categorias" 400 "no"

section "3. Paginação Inicial"
for p in 1 2 3; do req_get "/qualificacoes/historico?limit=5&page=$p" 200 "Historico Pag $p" 650 "yes"; done

section "4. CRUD Basico (Skeleton)"
if [ -z "$TOKEN" ]; then
  log_skip "POST Historico" "Sem token"
  log_skip "PUT Historico" "Sem token"
  log_skip "DELETE Historico" "Sem token"
else
  # Placeholder: será expandido em próxima etapa
  post_st=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/qualificacoes/historico" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}')
  [[ "$post_st" =~ ^(400|422|201)$ ]] && log_pass "POST Historico" "$post_st" || log_fail "POST Historico" "$post_st"
  put_st=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$API_BASE/qualificacoes/historico/1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"x":1}')
  [[ "$put_st" =~ ^(200|400|404|422)$ ]] && log_pass "PUT Historico" "$put_st" || log_fail "PUT Historico" "$put_st"
  del_st=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_BASE/qualificacoes/historico/999999" -H "Authorization: Bearer $TOKEN")
  [[ "$del_st" =~ ^(200|404)$ ]] && log_pass "DELETE Historico" "$del_st" || log_fail "DELETE Historico" "$del_st"
fi

section "5. Performance Spot"
start=$(python3 -c "import time;print(int(time.time()*1000))")
curl -s "$API_BASE/qualificacoes/historico?limit=50" > /dev/null || true
end=$(python3 -c "import time;print(int(time.time()*1000))")
lat=$((end-start))
if [ $lat -lt 350 ]; then log_pass "Historico 50 itens" "${lat}ms"; elif [ $lat -lt 800 ]; then log_warn "Historico 50 itens" "${lat}ms"; else log_fail "Historico 50 itens" "${lat}ms"; fi

# Determinar OVERALL
if [ $crit -gt 0 ]; then OVERALL="CRITICO"; elif [ $fail -gt 0 ]; then OVERALL="FALHOU"; elif [ $warn -gt 5 ]; then OVERALL="ATENCAO"; else OVERALL="OK"; fi

# Relatorio Markdown
{
  echo "# Auditoria Completa Qualificacoes ($TS)"
  echo "\n**Status Geral:** $OVERALL"
  echo "\n|Teste|Resultado|Detalhe|"
  echo "|-----|---------|-------|"
  for r in "${RESULTS[@]}"; do s="${r%%|*}"; rest="${r#*|}"; nm="${rest%%|*}"; dt="${rest##*|}"; echo "|$nm|$s|$dt|"; done
  echo "\n**Totais:** Total=$total Pass=$pass Fail=$fail Warn=$warn Skip=$skip Crit=$crit"
  echo "\n> Esta é a fase inicial (skeleton). Próximas execuções incluirão: testes avançados de filtros, carga concorrente, probes de segurança e validação de consistência de dados pós-soft delete."
} > "$OUT_MD"

# Relatorio HTML
{
  echo "<html><head><meta charset='utf-8'><title>Auditoria Completa $TS</title><style>body{font-family:system-ui;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;font-size:13px}th{background:#222;color:#fff}tr.PASS{background:#e7f9ef}tr.FAIL{background:#fdeaea}tr.WARN{background:#fff6dd}tr.SKIP{background:#eef3ff}</style></head><body>"
  echo "<h1>Auditoria Completa Qualificações</h1><p>Status: <strong>$OVERALL</strong></p><table><tr><th>Teste</th><th>Resultado</th><th>Detalhe</th></tr>"
  for r in "${RESULTS[@]}"; do s="${r%%|*}"; rest="${r#*|}"; nm="${rest%%|*}"; dt="${rest##*|}"; echo "<tr class='$s'><td>$nm</td><td>$s</td><td>$dt</td></tr>"; done
  echo "</table><p>Total:$total Pass:$pass Fail:$fail Warn:$warn Skip:$skip Crit:$crit</p><p><em>Skeleton inicial. Próximas etapas ampliarão cobertura.</em></p></body></html>"
} > "$OUT_HTML"

echo "Relatorios completos (fase inicial): $OUT_MD | $OUT_HTML"

# Exit code baseado em criticidade/falhas
if [ $crit -gt 0 ] || [ $fail -gt 0 ]; then exit 1; else exit 0; fi
