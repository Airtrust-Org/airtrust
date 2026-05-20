#!/bin/bash
set -uo pipefail

BASE="https://airtrust-api-production.airtrust.workers.dev"
ESCALA_ID="9ad63f4d-940f-463b-a077-8c9553a4bd97"

get_token() {
  local email=$1
  local pass=$2
  local token=""
  for i in 1 2 3 4 5; do
    local resp
    resp=$(curl -s --max-time 30 -X POST "${BASE}/api/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"${email}\",\"senha\":\"${pass}\"}")
    token=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])" 2>/dev/null || echo "")
    if [ -n "$token" ] && [ "$token" != "" ]; then
      echo "$token"
      return 0
    fi
    echo "  retry $i..." >&2
    sleep 10
  done
  echo "FAIL"
}

echo "Getting admin token (may need retries due to bcrypt in Workers)..."
TOKEN_ADM=$(get_token "admin@airtrust.com" "Admin@123")
if [ "$TOKEN_ADM" = "FAIL" ] || [ -z "$TOKEN_ADM" ]; then
  echo "FATAL: Could not get admin token after 5 retries"
  exit 1
fi
echo "Admin token: ${TOKEN_ADM:0:30}..."

echo ""
echo "=========================================="
echo "=== SL1: Slots avançados ==="
echo "=========================================="

echo ""
echo "--- SL1-01: PIC_CHK ---"
RESP=$(curl -s --max-time 15 -w '\nHTTP:%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
  -d '{"funcionario_id":"2","aeronave_id":25,"funcao":"PIC_CHK","data_inicio":"2026-05-01","data_fim":"2026-05-08"}')
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v '^HTTP:')
echo "[$HTTP] PIC_CHK: ${BODY:0:300}"
# Cleanup if created
if [ "$HTTP" = "201" ] || [ "$HTTP" = "200" ]; then
  AID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null || echo "")
  if [ -n "$AID" ]; then
    echo "  Created $AID — cleaning up..."
    curl -s --max-time 10 -X DELETE -H "Authorization: Bearer $TOKEN_ADM" "${BASE}/api/escalas/${ESCALA_ID}/alocacoes/${AID}" > /dev/null
  fi
fi

echo ""
echo "--- SL1-02: SIC_CHK ---"
RESP=$(curl -s --max-time 15 -w '\nHTTP:%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
  -d '{"funcionario_id":"4","aeronave_id":25,"funcao":"SIC_CHK","data_inicio":"2026-05-01","data_fim":"2026-05-08"}')
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v '^HTTP:')
echo "[$HTTP] SIC_CHK: ${BODY:0:300}"
if [ "$HTTP" = "201" ] || [ "$HTTP" = "200" ]; then
  AID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null || echo "")
  if [ -n "$AID" ]; then
    echo "  Created $AID — cleaning up..."
    curl -s --max-time 10 -X DELETE -H "Authorization: Bearer $TOKEN_ADM" "${BASE}/api/escalas/${ESCALA_ID}/alocacoes/${AID}" > /dev/null
  fi
fi

echo ""
echo "--- SL1-03: INSTRUTOR ---"
RESP=$(curl -s --max-time 15 -w '\nHTTP:%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
  -d '{"funcionario_id":"8","aeronave_id":25,"funcao":"INSTRUTOR","data_inicio":"2026-05-09","data_fim":"2026-05-15"}')
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v '^HTTP:')
echo "[$HTTP] INSTRUTOR: ${BODY:0:300}"
if [ "$HTTP" = "201" ] || [ "$HTTP" = "200" ]; then
  AID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null || echo "")
  if [ -n "$AID" ]; then
    echo "  Created $AID — cleaning up..."
    curl -s --max-time 10 -X DELETE -H "Authorization: Bearer $TOKEN_ADM" "${BASE}/api/escalas/${ESCALA_ID}/alocacoes/${AID}" > /dev/null
  fi
fi

echo ""
echo "--- SL1-04: FLEX (sem aeronave) ---"
RESP=$(curl -s --max-time 15 -w '\nHTTP:%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
  -d '{"funcionario_id":"9","funcao":"FLEX","data_inicio":"2026-05-01","data_fim":"2026-05-15"}')
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v '^HTTP:')
echo "[$HTTP] FLEX: ${BODY:0:300}"
if [ "$HTTP" = "201" ] || [ "$HTTP" = "200" ]; then
  AID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null || echo "")
  if [ -n "$AID" ]; then
    echo "  Created $AID — cleaning up..."
    curl -s --max-time 10 -X DELETE -H "Authorization: Bearer $TOKEN_ADM" "${BASE}/api/escalas/${ESCALA_ID}/alocacoes/${AID}" > /dev/null
  fi
fi

echo ""
echo "=========================================="
echo "=== C1-03: Tripulantes-operacionais CMA/FRMS ==="
echo "=========================================="
RESP=$(curl -s --max-time 15 -H "Authorization: Bearer $TOKEN_ADM" "${BASE}/api/escalas/tripulantes-operacionais?aeronaveid=25&funcao=PIC&incluir_bloqueados=true")
echo "$RESP" | python3 -c "
import sys, json
data = json.load(sys.stdin)
trips = data.get('data', {}).get('tripulantes', [])
for t in trips[:15]:
    print(f\"{t.get('nome','?')[:30]:<32} cma_ok={t.get('cma_valido','?')} cma_dias={t.get('cma_dias_restantes','?'):>4} frms={t.get('frms_score','?'):>3} frms_st={t.get('frms_status','?'):<8} status={t.get('status_operacional','?'):<15} pode={t.get('pode_ser_alocado','?')}\")
print()
resumo = data.get('data', {}).get('resumo', {})
print(f\"Resumo: aptos={resumo.get('total_aptos','?')} bloq={resumo.get('total_bloqueados','?')} bloq_cma={resumo.get('bloqueados_cma','?')} bloq_frms={resumo.get('bloqueados_frms','?')}\")
" 2>/dev/null || echo "Parse error"

echo ""
echo "=========================================="
echo "=== S3: Manager RBAC ==="
echo "=========================================="
echo "Getting manager token..."
sleep 3
TOKEN_MGR=$(get_token "manager@airtrust.com" "Admin@123")
if [ "$TOKEN_MGR" = "FAIL" ] || [ -z "$TOKEN_MGR" ]; then
  echo "Manager token FAIL — will test with code review only"
else
  echo "Manager token: ${TOKEN_MGR:0:30}..."

  HTTP=$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_MGR" "${BASE}/api/escalas?ano=2026")
  echo "GET /escalas: $HTTP"
  if [ "$HTTP" = "200" ]; then echo "  PASS"; else echo "  FAIL (expected 200)"; fi

  HTTP=$(curl -s --max-time 15 -o /dev/null -w '%{http_code}' -X PATCH \
    -H "Authorization: Bearer $TOKEN_MGR" \
    -H "Content-Type: application/json" \
    "${BASE}/api/escalas/${ESCALA_ID}/status" \
    -d '{"status":"publicada"}')
  echo "PATCH /status (manager): $HTTP"
  echo "  (manager should be allowed: admin+manager in requireRole)"
fi

echo ""
echo "=== DONE ==="
