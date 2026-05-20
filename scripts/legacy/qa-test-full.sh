#!/bin/bash
set -euo pipefail

BASE="https://airtrust-api-production.airtrust.workers.dev"
ESCALA_ID="9ad63f4d-940f-463b-a077-8c9553a4bd97"

# === Get admin token ===
TOKEN=$(curl -s -X POST "${BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@airtrust.com","senha":"Admin@123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")
echo "TOKEN obtained: ${TOKEN:0:20}..."

# === S1-03: Token válido com body vazio ===
echo ""
echo "=== S1-03: POST /alocacoes com body vazio ==="
RESP=$(curl -s -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
  -d '{}')
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "HTTP: $HTTP"
echo "Body: $BODY"
if [ "$HTTP" = "400" ] || [ "$HTTP" = "422" ]; then
  echo "PASS - Validação Zod retornou $HTTP"
elif [ "$HTTP" = "500" ]; then
  echo "FAIL - Retornou 500 em vez de 400/422!"
else
  echo "INFO - Retornou $HTTP"
fi

# === S2: Multi-tenant ===
echo ""
echo "=== S2-01: Tentar login como empresa2 ==="
RESP_E2=$(curl -s -X POST "${BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@empresa2.com","senha":"Admin@123"}')
echo "Login empresa2: $RESP_E2"

# === S3: RBAC ===
echo ""
echo "=== S3-01: Login como viewer (user@airtrust.com) ==="
RESP_USER=$(curl -s -X POST "${BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@airtrust.com","senha":"Admin@123"}')
TOKEN_USER=$(echo "$RESP_USER" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('data',{}).get('accessToken','SEM_TOKEN'))" 2>/dev/null || echo "SEM_TOKEN")
echo "TOKEN_USER: ${TOKEN_USER:0:30}..."

echo ""
echo "=== S3-02: Login como manager ==="
RESP_MGR=$(curl -s -X POST "${BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@airtrust.com","senha":"Admin@123"}')
TOKEN_MGR=$(echo "$RESP_MGR" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('data',{}).get('accessToken','SEM_TOKEN'))" 2>/dev/null || echo "SEM_TOKEN")
echo "TOKEN_MGR: ${TOKEN_MGR:0:30}..."

# S3-03: Viewer tentando criar escala
echo ""
echo "=== S3-03: Viewer tentando POST /escalas (criar escala) ==="
if [ "$TOKEN_USER" != "SEM_TOKEN" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST \
    -H "Authorization: Bearer $TOKEN_USER" \
    -H "Content-Type: application/json" \
    "${BASE}/api/escalas" \
    -d '{"mes":7,"ano":2026,"empresaid":6}')
  HTTP=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  echo "HTTP: $HTTP"
  echo "Body: $BODY"
  if [ "$HTTP" = "403" ]; then
    echo "PASS - Viewer bloqueado com 403"
  elif [ "$HTTP" = "201" ]; then
    echo "FAIL CRITICO - Viewer conseguiu criar escala!"
  else
    echo "INFO - Retornou $HTTP"
  fi
else
  echo "SKIP - Token de viewer não disponível"
fi

# S3-04: Viewer tentando criar alocação
echo ""
echo "=== S3-04: Viewer tentando POST /alocacoes ==="
if [ "$TOKEN_USER" != "SEM_TOKEN" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X POST \
    -H "Authorization: Bearer $TOKEN_USER" \
    -H "Content-Type: application/json" \
    "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
    -d '{"funcionarioid":"x","aeronaveid":1,"funcao":"PIC","datainicio":"2026-05-01","datafim":"2026-05-15"}')
  HTTP=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  echo "HTTP: $HTTP"
  echo "Body: $BODY"
  if [ "$HTTP" = "403" ]; then
    echo "PASS - Viewer bloqueado com 403"
  elif [ "$HTTP" = "201" ] || [ "$HTTP" = "400" ]; then
    echo "FAIL - Viewer passou pela auth (HTTP=$HTTP)!"
  else
    echo "INFO - Retornou $HTTP"
  fi
else
  echo "SKIP"
fi

# S3-05: Viewer tentando mudar status
echo ""
echo "=== S3-05: Viewer tentando PATCH /status ==="
if [ "$TOKEN_USER" != "SEM_TOKEN" ]; then
  RESP=$(curl -s -w '\n%{http_code}' -X PATCH \
    -H "Authorization: Bearer $TOKEN_USER" \
    -H "Content-Type: application/json" \
    "${BASE}/api/escalas/${ESCALA_ID}/status" \
    -d '{"status":"publicada"}')
  HTTP=$(echo "$RESP" | tail -1)
  BODY=$(echo "$RESP" | sed '$d')
  echo "HTTP: $HTTP"
  echo "Body: $BODY"
  if [ "$HTTP" = "403" ]; then
    echo "PASS - Viewer bloqueado com 403"
  else
    echo "INFO - Retornou $HTTP (verificar se RBAC está ativo)"
  fi
else
  echo "SKIP"
fi

echo ""
echo "=== Performance PR1-01 ==="
echo "--- GET /escalas ---"
time curl -s -H "Authorization: Bearer $TOKEN" "${BASE}/api/escalas?ano=2026" > /dev/null
echo "--- GET /escalas/:id/calendario ---"
time curl -s -H "Authorization: Bearer $TOKEN" "${BASE}/api/escalas/${ESCALA_ID}/calendario" > /dev/null
echo "--- GET /tripulantes-operacionais ---"
time curl -s -H "Authorization: Bearer $TOKEN" "${BASE}/api/escalas/tripulantes-operacionais?aeronaveid=25&funcao=PIC" > /dev/null
echo "--- GET /cobertura ---"
time curl -s -H "Authorization: Bearer $TOKEN" "${BASE}/api/escalas/${ESCALA_ID}/cobertura" > /dev/null

echo ""
echo "=== Export E1-01 ==="
RESP=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN" "${BASE}/api/escalas/${ESCALA_ID}/export?formato=csv")
HTTP=$(echo "$RESP" | tail -1)
echo "Export CSV HTTP: $HTTP"
if [ "$HTTP" = "200" ]; then
  echo "PASS - Export CSV retorna 200"
  echo "$RESP" | head -5
elif [ "$HTTP" = "404" ] || [ "$HTTP" = "501" ]; then
  echo "INFO - Export não implementado ($HTTP)"
else
  echo "INFO - Export retornou $HTTP"
fi

echo ""
echo "=== E1-03: Export sem auth ==="
HTTP=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/api/escalas/${ESCALA_ID}/export?formato=csv")
echo "Export sem token HTTP: $HTTP"
if [ "$HTTP" = "401" ]; then
  echo "PASS"
else
  echo "FAIL - Esperado 401, recebeu $HTTP"
fi

echo ""
echo "=== F1-03: datainicio > datafim ==="
RESP=$(curl -s -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
  -d '{"funcionarioid":"test","aeronaveid":25,"funcao":"PIC","datainicio":"2026-05-20","datafim":"2026-05-01"}')
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "HTTP: $HTTP Body: $BODY"
if [ "$HTTP" = "400" ] || [ "$HTTP" = "422" ]; then
  echo "PASS - Datas invertidas rejeitadas"
elif [ "$HTTP" = "201" ]; then
  echo "FAIL - Datas invertidas aceitas!"
else
  echo "INFO - Retornou $HTTP"
fi

echo ""
echo "=== F1-04: data fora do mês da escala ==="
RESP=$(curl -s -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/${ESCALA_ID}/alocacoes" \
  -d '{"funcionarioid":"test","aeronaveid":25,"funcao":"PIC","datainicio":"2026-06-01","datafim":"2026-06-15"}')
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "HTTP: $HTTP Body: $BODY"
if [ "$HTTP" = "400" ] || [ "$HTTP" = "422" ]; then
  echo "PASS - Data fora do mês rejeitada"
elif [ "$HTTP" = "201" ]; then
  echo "FAIL - Data fora do mês aceita!"
else
  echo "INFO - Retornou $HTTP"
fi

echo ""
echo "=== Templates T1-01 ==="
RESP=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN" "${BASE}/api/escalas/templates")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "Templates HTTP: $HTTP"
echo "Body: ${BODY:0:200}"

echo ""
echo "=== Padrões P1-01 ==="
RESP=$(curl -s -w '\n%{http_code}' -H "Authorization: Bearer $TOKEN" "${BASE}/api/escalas/padroes")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "Padrões HTTP: $HTTP"
echo "Body: ${BODY:0:200}"

echo ""
echo "=== Gerar Ano G1-01 (2028 para não conflitar) ==="
RESP=$(curl -s -w '\n%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/gerar-ano" \
  -d '{"ano":2028,"empresaid":6}')
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')
echo "Gerar-ano HTTP: $HTTP"
echo "Body: ${BODY:0:300}"

echo ""
echo "=== DONE ==="
