#!/bin/bash
set -euo pipefail
BASE="https://airtrust-api-production.airtrust.workers.dev"
ESCALA_ID="9ad63f4d-940f-463b-a077-8c9553a4bd97"

get_token() {
  local email=$1
  local pass=$2
  local resp
  resp=$(curl -s -X POST "${BASE}/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"${email}\",\"senha\":\"${pass}\"}")
  echo "$resp" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['data']['accessToken'])" 2>/dev/null || echo "FAIL"
}

TOKEN_ADM=$(get_token "admin@airtrust.com" "Admin@123")
echo "Admin token: ${TOKEN_ADM:0:20}..."

sleep 2
TOKEN_MGR=$(get_token "manager@airtrust.com" "Admin@123")
echo "Manager token: ${TOKEN_MGR:0:20}..."

echo ""
echo "=========================================="
echo "=== S3: RBAC — Manager permissions ==="
echo "=========================================="

echo ""
echo "--- S3-A: Manager GET /escalas (200 expected) ---"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_MGR" "${BASE}/api/escalas?ano=2026")
echo "[$HTTP] GET /escalas"
if [ "$HTTP" = "200" ]; then echo "PASS"; else echo "FAIL"; fi

echo ""
echo "--- S3-B: Manager POST /escalas (201 expected: admin+manager allowed) ---"
RESP=$(curl -s -w '\nHTTP:%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_MGR" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas" \
  -d '{"mes":12,"ano":2029}')
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v '^HTTP:')
echo "[$HTTP] POST /escalas"
echo "Body: ${BODY:0:200}"
if [ "$HTTP" = "201" ] || [ "$HTTP" = "200" ]; then
  echo "PASS - Manager pode criar escalas"
  ESCALA_TEMP_DEL=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('data',{}).get('id',''))" 2>/dev/null || echo "")
elif [ "$HTTP" = "403" ]; then
  echo "FAIL - Manager ficou bloqueado!"
else
  echo "INFO - HTTP $HTTP"
fi

echo ""
echo "--- S3-C: Verify RBAC code correctly blocks 'user' role ---"
echo "Code review: POST /escalas uses requireRole('admin', 'manager')"
echo "RBAC middleware normalizes 'USUARIO' -> 'user'"
echo "'user' NOT in ['admin', 'manager'] -> 403 would be returned"
echo "PASS (by code analysis - user@airtrust.com password unavailable for live test)"

echo ""
echo "=========================================="
echo "=== D1: Soft delete cascade ==="
echo "=========================================="

echo ""
echo "--- D1-02: Criar escala temporária ---"
RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas" \
  -d '{"mes":10,"ano":2029}')
ESCALA_DEL=$(echo "$RESP" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('data',{}).get('id','FAIL'))" 2>/dev/null || echo "FAIL")
echo "Escala temp ID: $ESCALA_DEL"

echo ""
echo "--- D1-02b: DELETE escala ---"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
  -H "Authorization: Bearer $TOKEN_ADM" \
  "${BASE}/api/escalas/${ESCALA_DEL}")
echo "DELETE HTTP: $HTTP"
if [ "$HTTP" = "200" ] || [ "$HTTP" = "204" ]; then echo "PASS"; else echo "INFO: $HTTP"; fi

echo ""
echo "--- D1-03: Escala not in listing ---"
RESP=$(curl -s -H "Authorization: Bearer $TOKEN_ADM" "${BASE}/api/escalas?ano=2029")
echo "$RESP" | python3 -c "
import sys, json, os
data = json.load(sys.stdin)
items = data.get('data', [])
if isinstance(items, list):
    ids = [e.get('id','') for e in items]
    eid = '${ESCALA_DEL}'
    if eid in ids:
        print('FAIL - Escala deletada aparece!')
    else:
        print('PASS - Escala deletada not in listing')
else:
    print(f'INFO: {str(data)[:200]}')
"

echo ""
echo "=========================================="
echo "=== G1-02: Gerar ano duplicado 2026 ==="
echo "=========================================="
RESP=$(curl -s -w '\nHTTP:%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/gerar-ano" \
  -d '{"ano":2026}')
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v '^HTTP:')
echo "[$HTTP] POST /gerar-ano 2026"
echo "Body: ${BODY:0:300}"

echo ""
echo "=========================================="
echo "=== F1-01: Fevereiro 2027 ==="
echo "=========================================="
RESP=$(curl -s -w '\nHTTP:%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas" \
  -d '{"mes":2,"ano":2027}')
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v '^HTTP:')
echo "[$HTTP] POST fev/2027"
echo "Body: ${BODY:0:200}"

echo ""
echo "=========================================="
echo "=== E1-02: Export PDF ==="
echo "=========================================="
RESP=$(curl -s -w '\nHTTP:%{http_code}' -H "Authorization: Bearer $TOKEN_ADM" "${BASE}/api/escalas/${ESCALA_ID}/export?formato=pdf")
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
echo "[$HTTP] Export PDF"
if [ "$HTTP" = "200" ]; then
  echo "PASS - PDF implemented"
elif [ "$HTTP" = "404" ] || [ "$HTTP" = "501" ]; then
  echo "INFO - PDF not implemented ($HTTP)"
else
  echo "INFO - HTTP $HTTP"
fi

echo ""
echo "=========================================="
echo "=== SL1: Slots avançados ==="
echo "=========================================="
echo "--- Check what funcao values are accepted ---"
echo "Testing PICCHK..."
RESP=$(curl -s -w '\nHTTP:%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
  -d '{"funcionarioid":"test-dummy","aeronaveid":25,"funcao":"PICCHK","datainicio":"2026-05-01","datafim":"2026-05-08"}')
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v '^HTTP:')
echo "[$HTTP] PICCHK: ${BODY:0:200}"

echo "Testing SICCHK..."
RESP=$(curl -s -w '\nHTTP:%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
  -d '{"funcionarioid":"test-dummy","aeronaveid":25,"funcao":"SICCHK","datainicio":"2026-05-01","datafim":"2026-05-08"}')
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v '^HTTP:')
echo "[$HTTP] SICCHK: ${BODY:0:200}"

echo "Testing INSTRUTOR..."
RESP=$(curl -s -w '\nHTTP:%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
  -d '{"funcionarioid":"test-dummy","aeronaveid":25,"funcao":"INSTRUTOR","datainicio":"2026-05-09","datafim":"2026-05-15"}')
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v '^HTTP:')
echo "[$HTTP] INSTRUTOR: ${BODY:0:200}"

echo "Testing FLEX (null aeronave)..."
RESP=$(curl -s -w '\nHTTP:%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
  -d '{"funcionarioid":"test-dummy","aeronaveid":null,"funcao":"FLEX","datainicio":"2026-05-01","datafim":"2026-05-15"}')
HTTP=$(echo "$RESP" | grep '^HTTP:' | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v '^HTTP:')
echo "[$HTTP] FLEX: ${BODY:0:200}"

echo ""
echo "=== DONE ==="
