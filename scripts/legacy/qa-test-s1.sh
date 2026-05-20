#!/bin/bash
set -euo pipefail

ESCALA_ID="9ad63f4d-940f-463b-a077-8c9553a4bd97"
BASE="https://airtrust-api-production.airtrust.workers.dev"

echo "=== S1-01: Sem token em endpoints de escalas ==="

endpoints=(
  "/api/escalas"
  "/api/escalas/$ESCALA_ID"
  "/api/escalas/$ESCALA_ID/calendario"
  "/api/escalas/$ESCALA_ID/alocacoes"
  "/api/escalas/$ESCALA_ID/cobertura"
  "/api/escalas/$ESCALA_ID/conflitos"
  "/api/escalas/$ESCALA_ID/alertas"
  "/api/escalas/$ESCALA_ID/export"
  "/api/escalas/tripulantes-operacionais?aeronaveid=1"
)

ALL_PASS=true
for ep in "${endpoints[@]}"; do
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${ep}")
  if [ "$HTTP" = "401" ]; then
    echo "  PASS [$HTTP] $ep"
  else
    echo "  FAIL [$HTTP] $ep  <<< ESPERADO 401!"
    ALL_PASS=false
  fi
done

echo ""
if [ "$ALL_PASS" = true ]; then
  echo "S1-01: PASS - Todos os endpoints retornam 401 sem token"
else
  echo "S1-01: FAIL - Algum endpoint não retornou 401!"
fi

echo ""
echo "=== S1-02: Token inválido ==="
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer token_invalido_qualquer" "${BASE}/api/escalas")
if [ "$HTTP" = "401" ]; then
  echo "  PASS [$HTTP] Token inválido retorna 401"
else
  echo "  FAIL [$HTTP] Token inválido retorna $HTTP (esperado 401)"
fi

echo ""
echo "=== S1-03: Token válido sem body no POST ==="
# Need token for this - will get it inline
TOKEN=$(curl -s -X POST "${BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@airtrust.com","senha":"Admin@123"}' \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('data',{}).get('token') or r.get('data',{}).get('accessToken','FAIL'))")

HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/$ESCALA_ID/alocacoes" \
  -d '{}')
echo "  [$HTTP] POST /alocacoes with empty body"
if [ "$HTTP" = "400" ] || [ "$HTTP" = "422" ]; then
  echo "  PASS - Validação retornou $HTTP"
elif [ "$HTTP" = "500" ]; then
  echo "  FAIL - Retornou 500 em vez de 400/422!"
else
  echo "  INFO - Retornou $HTTP"
fi

# Show the actual response for S1-03
echo ""
echo "  Response body:"
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "${BASE}/api/escalas/$ESCALA_ID/alocacoes" \
  -d '{}' | python3 -m json.tool 2>/dev/null || echo "  (não é JSON válido)"
