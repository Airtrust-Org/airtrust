#!/bin/bash
# AUDITORIA ESTRITA - QUALIFICACOES (AirTrust)
# Objetivo: validação rigorosa (status, performance, JSON, segurança)
# Compatível com bash 3.2 (macOS) - evita arrays associativos

set -e
API_BASE="https://airtrust-api-staging.airtrust.workers.dev/api"
TOKEN="${1:-INVALID_TOKEN}"
REPORT_DIR="relatorios-auditoria"
TS=$(date '+%Y-%m-%d_%H-%M-%S')
OUT_HTML="$REPORT_DIR/auditoria-strict-$TS.html"
OUT_MD="$REPORT_DIR/auditoria-strict-$TS.md"
mkdir -p "$REPORT_DIR"

pass=0; fail=0; warn=0; total=0; crit=0
RESULTS=()

log_pass(){ echo "✅ PASS - $1"; RESULTS+=("PASS|$1|$2"); pass=$((pass+1)); total=$((total+1)); }
log_fail(){ echo "❌ FAIL - $1"; RESULTS+=("FAIL|$1|$2"); fail=$((fail+1)); total=$((total+1)); [ "${3:-}" = "critical" ] && crit=$((crit+1)); }
log_warn(){ echo "⚠️  WARN - $1"; RESULTS+=("WARN|$1|$2"); warn=$((warn+1)); total=$((total+1)); }

header(){ echo "===== AUDITORIA ESTRITA QUALIFICACOES - $TS ====="; }
section(){ echo; echo "--- $1 ---"; }

check_get(){
  local name="$1"; local endpoint="$2"; local expected="$3"; local max_ms="$4";
  echo "→ GET $endpoint";
  local start=$(python3 -c "import time;print(int(time.time()*1000))")
  local tmp=$(mktemp)
  curl -s -w "\n%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE$endpoint" > "$tmp" || true
  local end=$(python3 -c "import time;print(int(time.time()*1000))")
  local status=$(tail -n1 "$tmp")
  local body=$(sed '$d' "$tmp")
  local dur=$((end-start))
  rm -f "$tmp"
  if [ "$status" = "$expected" ]; then log_pass "$name - Status" "HTTP $status"; else log_fail "$name - Status" "HTTP $status (esperado $expected)"; fi
  if [ $dur -le $max_ms ]; then log_pass "$name - Performance" "${dur}ms <= ${max_ms}ms"; elif [ $dur -le $((max_ms*2)) ]; then log_warn "$name - Performance" "${dur}ms"; else log_fail "$name - Performance" "${dur}ms > ${max_ms}ms"; fi
  echo "$body" | python3 -m json.tool >/dev/null 2>&1 && log_pass "$name - JSON" "válido" || log_fail "$name - JSON" "inválido"
  echo "$body" | grep -qi "Exception" && log_warn "$name - Conteúdo" "Leak de exceção" || log_pass "$name - Conteúdo" "Limpo"
}

check_auth(){
  local endpoint="$1"; local label="$2";
  local st=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE$endpoint" || true)
  if [ "$st" = "401" ] || [ "$st" = "403" ]; then log_pass "$label" "Protegido ($st)"; else log_fail "$label" "Não protegido ($st)" "critical"; fi
}

check_delete(){
  local endpoint="$1"; local label="$2";
  local st=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "Authorization: Bearer $TOKEN" "$API_BASE$endpoint" || true)
  if [[ "$st" =~ ^(200|404)$ ]]; then log_pass "$label" "Soft delete ($st)"; else log_fail "$label" "Status $st"; fi
}

header
section "1. Proteção"
check_auth "/qualificacoes/tipos" "Auth /tipos"
check_auth "/qualificacoes/historico" "Auth /historico"

section "2. GET Essenciais"
check_get "Listar Tipos" "/qualificacoes/tipos?limit=5" 200 400
check_get "Listar Historico" "/qualificacoes/historico?limit=5&page=1" 200 500
check_get "Categorias" "/categorias" 200 300

section "3. Paginação"
for p in 1 2 3; do check_get "Historico Pag $p" "/qualificacoes/historico?limit=5&page=$p" 200 600; done

section "4. Escrita"
post_st=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_BASE/qualificacoes/historico" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{}')
[[ "$post_st" =~ ^(400|422|201)$ ]] && log_pass "POST Criar" "$post_st" || log_fail "POST Criar" "$post_st"
put_st=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$API_BASE/qualificacoes/historico/1" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"x":1}')
# Aceita 404 como caso válido (registro inexistente mas rota funcional)
[[ "$put_st" =~ ^(200|400|422|404)$ ]] && log_pass "PUT Editar" "$put_st" || log_fail "PUT Editar" "$put_st"
check_delete "/qualificacoes/historico/999999" "DELETE Soft"

section "5. Código"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
QUALIFICACOES_FILE="$SCRIPT_DIR/worker-airtrust/src/routes/qualificacoes.ts"
if [ ! -f "$QUALIFICACOES_FILE" ]; then
  QUALIFICACOES_FILE="$SCRIPT_DIR/src/routes/qualificacoes.ts"
fi
lines=$(wc -l "$QUALIFICACOES_FILE" | awk '{print $1}')
if [ "$lines" -gt 1500 ]; then log_warn "Tamanho arquivo" "$lines linhas"; else log_pass "Tamanho arquivo" "$lines linhas"; fi
handlers=$(grep -c "app\.get\|app\.post\|app\.put\|app\.delete" "$QUALIFICACOES_FILE" || true)
if [ "$handlers" -ge 25 ]; then log_pass "Handlers" "$handlers"; else log_warn "Handlers" "$handlers"; fi

section "6. Performance 50 itens"
start=$(python3 -c "import time;print(int(time.time()*1000))")
curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/historico?limit=50" > /dev/null || true
end=$(python3 -c "import time;print(int(time.time()*1000))")
lat=$((end-start))
if [ $lat -lt 350 ]; then log_pass "Histórico 50" "${lat}ms"; elif [ $lat -lt 800 ]; then log_warn "Histórico 50" "${lat}ms"; else log_fail "Histórico 50" "${lat}ms"; fi

if [ $crit -gt 0 ]; then OVERALL="CRITICO"; elif [ $fail -gt 0 ]; then OVERALL="FALHOU"; elif [ $warn -gt 5 ]; then OVERALL="ATENCAO"; else OVERALL="OK"; fi

{
  echo "# Auditoria Estrita Qualificacoes ($TS)"
  echo "\n**Status Geral:** $OVERALL"
  echo "\n|Teste|Resultado|Detalhe|"
  echo "|-----|---------|-------|"
  for r in "${RESULTS[@]}"; do s="${r%%|*}"; rest="${r#*|}"; nm="${rest%%|*}"; dt="${rest##*|}"; echo "|$nm|$s|$dt|"; done
} > "$OUT_MD"

{
  echo "<html><head><meta charset='utf-8'><title>Auditoria Estrita $TS</title><style>body{font-family:system-ui;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px;font-size:13px}th{background:#222;color:#fff}tr.PASS{background:#e7f9ef}tr.FAIL{background:#fdeaea}tr.WARN{background:#fff6dd}</style></head><body>"
  echo "<h1>Auditoria Estrita Qualificações</h1><p>Status: <strong>$OVERALL</strong></p><table><tr><th>Teste</th><th>Resultado</th><th>Detalhe</th></tr>"
  for r in "${RESULTS[@]}"; do s="${r%%|*}"; rest="${r#*|}"; nm="${rest%%|*}"; dt="${rest##*|}"; echo "<tr class='$s'><td>$nm</td><td>$s</td><td>$dt</td></tr>"; done
  echo "</table><p>Total:$total Pass:$pass Fail:$fail Warn:$warn Crit:$crit</p></body></html>"
} > "$OUT_HTML"

echo "Relatórios estritos: $OUT_MD | $OUT_HTML"

if [ $crit -gt 0 ] || [ $fail -gt 0 ]; then exit 1; else exit 0; fi
