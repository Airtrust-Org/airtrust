#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-https://airtrust-api-production.airtrust.workers.dev}"
EMAIL="${AIRTRUST_SMOKE_EMAIL:-}"
PASSWORD="${AIRTRUST_SMOKE_PASSWORD:-}"
TIMEOUT="${AIRTRUST_SMOKE_TIMEOUT:-15}"

json_get() {
  python3 -c 'import json, sys
path = sys.argv[1].split(".")
data = json.load(sys.stdin)
cur = data
for part in path:
    if isinstance(cur, list) and part.isdigit():
        cur = cur[int(part)]
    elif isinstance(cur, dict):
        cur = cur.get(part)
    else:
        cur = None
        break
print("" if cur is None else cur)
' "$1"
}

echo "=== SMOKE TEST CORE ==="
echo "API: $BASE"

echo "1) Health"
HEALTH=$(curl -fsSL --max-time "$TIMEOUT" "$BASE/api/health")
STATUS=$(printf '%s' "$HEALTH" | json_get status)
if [[ "$STATUS" != "healthy" ]]; then
  echo "❌ Health degradado: $HEALTH"
  exit 1
fi
echo "✓ Health OK"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "ℹ️ Credenciais ausentes; smoke core limitado a health publico"
  exit 0
fi

echo "2) Login"
LOGIN=$(curl -fsSL --max-time "$TIMEOUT" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"senha\":\"$PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN" | json_get data.accessToken)
if [[ -z "$TOKEN" ]]; then
  echo "❌ Falha no login"
  echo "$LOGIN"
  exit 1
fi
echo "✓ Login OK"

echo "3) Funcionarios"
FUNCIONARIOS=$(curl -fsSL --max-time "$TIMEOUT" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/funcionarios?page=1&limit=1")
SUCCESS=$(printf '%s' "$FUNCIONARIOS" | json_get success)
if [[ "$SUCCESS" != "True" && "$SUCCESS" != "true" ]]; then
  echo "❌ Endpoint /api/funcionarios falhou"
  echo "$FUNCIONARIOS"
  exit 1
fi
echo "✓ Funcionarios OK"

echo "✅ Smoke test core concluido"