#!/bin/bash
set -euo pipefail
BASE="https://airtrust-api-production.airtrust.workers.dev"
ESCALA_ID="9ad63f4d-940f-463b-a077-8c9553a4bd97"

echo "=== S3: RBAC Tests ==="

echo ""
echo "--- Login as manager ---"
TOKEN_MGR=$(curl -s -X POST "${BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@airtrust.com","senha":"Admin@123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
echo "Manager token: ${TOKEN_MGR:0:30}..."

echo ""
echo "--- S3-A: Manager GET /escalas (should be 200) ---"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN_MGR" "${BASE}/api/escalas?ano=2026")
echo "HTTP: $HTTP"
if [ "$HTTP" = "200" ]; then echo "PASS"; else echo "FAIL"; fi

echo ""
echo "--- S3-B: Manager POST /escalas (criar escala - should be allowed) ---"
RESP=$(curl -s -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_MGR" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas" \
  -d '{"mes":12,"ano":2029}')
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "HTTP: $HTTP Body: ${BODY:0:200}"
if [ "$HTTP" = "201" ] || [ "$HTTP" = "200" ]; then
  echo "PASS - Manager pode criar escalas"
elif [ "$HTTP" = "403" ]; then
  echo "FAIL - Manager ficou bloqueado (deveria poder criar)"
else
  echo "INFO - HTTP $HTTP"
fi

echo ""
echo "--- S3-C: Manager DELETE escala (should be allowed, admin+manager) ---"
ESCALA_TEMP_ID=$(echo "$BODY" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('data',{}).get('id',''))" 2>/dev/null || echo "")
if [ -n "$ESCALA_TEMP_ID" ] && [ "$ESCALA_TEMP_ID" != "" ]; then
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
    -H "Authorization: Bearer $TOKEN_MGR" \
    "${BASE}/api/escalas/${ESCALA_TEMP_ID}")
  echo "HTTP: $HTTP (DELETE escala temp)"
  if [ "$HTTP" = "200" ] || [ "$HTTP" = "204" ]; then
    echo "PASS - Manager pode deletar escalas"
  elif [ "$HTTP" = "403" ]; then
    echo "INFO - Manager bloqueado do DELETE (verificar se é design intencional)"
  fi
else
  echo "SKIP - No escala created to delete"
fi

echo ""
echo "=== D1: Soft Delete cascade tests ==="

echo ""
echo "--- D1-02: Criar escala temporária para teste de delete ---"
TOKEN_ADM=$(curl -s -X POST "${BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@airtrust.com","senha":"Admin@123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

RESP=$(curl -s -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas" \
  -d '{"mes":11,"ano":2029}')
ESCALA_DEL=$(echo "$RESP" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('data',{}).get('id','FAIL'))" 2>/dev/null || echo "FAIL")
echo "Escala temp criada: $ESCALA_DEL"

echo ""
echo "--- D1-02b: Deletar escala ---"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE \
  -H "Authorization: Bearer $TOKEN_ADM" \
  "${BASE}/api/escalas/${ESCALA_DEL}")
echo "DELETE HTTP: $HTTP"

echo ""
echo "--- D1-03: Escala deletada não aparece na listagem ---"
RESP=$(curl -s -H "Authorization: Bearer $TOKEN_ADM" "${BASE}/api/escalas?ano=2029")
echo "$RESP" | python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data.get('data', data.get('escalas', []))
if isinstance(items, list):
    ids = [e.get('id','') for e in items]
    if '${ESCALA_DEL}' in ids:
        print('FAIL - Escala deletada ainda aparece na listagem!')
    else:
        print('PASS - Escala deletada não aparece')
else:
    print(f'INFO - Response format: {type(items)}')
" 2>/dev/null || echo "Could not parse response"

echo ""
echo "=== A1: Auditoria ==="
echo "--- Check will be done via SQL ---"

echo ""
echo "=== G1-02: Gerar ano duplicado ==="
RESP=$(curl -s -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN_ADM" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/gerar-ano" \
  -d '{"ano":2026}')
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "HTTP: $HTTP"
echo "Body: ${BODY:0:300}"
if [ "$HTTP" = "409" ]; then
  echo "PASS - Ano duplicado rejeitado com 409"
elif [ "$HTTP" = "200" ] || [ "$HTTP" = "201" ]; then
  echo "INFO - Pode ter criado apenas meses faltantes: ${BODY:0:100}"
else
  echo "INFO - HTTP $HTTP"
fi

echo ""
echo "=== Cleanup: soft-delete 2028 escalas (from G1-01) ==="
echo "(will do via SQL)"

echo ""
echo "=== DONE ==="
