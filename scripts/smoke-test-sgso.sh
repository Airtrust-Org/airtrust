#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-https://airtrust-api-production.airtrust.workers.dev}"
WEB_BASE="${WEB_BASE:-https://airtrust.online}"
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

api_get() {
  local path="$1"
  local outfile="$2"
  curl -sS --max-time "$TIMEOUT" -o "$outfile" -w '%{http_code}' \
    -H "Authorization: Bearer $TOKEN" \
    "$BASE$path"
}

assert_success_json() {
  local label="$1"
  local status="$2"
  local file="$3"
  if [[ "$status" != "200" ]]; then
    echo "❌ $label retornou HTTP $status"
    cat "$file"
    exit 1
  fi

  local success
  success=$(python3 -c 'import json, sys
data = json.load(open(sys.argv[1], encoding="utf-8"))
print(str(data.get("success", False)).lower())
' "$file")
  if [[ "$success" != "true" ]]; then
    echo "❌ $label retornou payload inválido"
    cat "$file"
    exit 1
  fi

  echo "✓ $label"
}

TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "=== SMOKE TEST SGSO ==="
echo "API: $BASE"
echo "WEB: $WEB_BASE"

echo "1) Shell público SGSO"
for route in /sgso /sgso/relprev /sgso/bowtie /sgso/frat; do
  HTML=$(curl -fsSL --max-time "$TIMEOUT" "$WEB_BASE$route")
  if ! printf '%s' "$HTML" | grep -qi 'build-version'; then
    echo "❌ Página $route não retornou shell HTML esperado"
    exit 1
  fi
  echo "✓ $route"
done

echo "2) Health da API"
HEALTH=$(curl -fsSL --max-time "$TIMEOUT" "$BASE/api/health")
STATUS=$(printf '%s' "$HEALTH" | json_get status)
if [[ "$STATUS" != "healthy" ]]; then
  echo "❌ Health SGSO/API degradado: $HEALTH"
  exit 1
fi
echo "✓ Health OK"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "ℹ️  Credenciais de smoke ausentes; validação SGSO ficou restrita ao shell público e health"
  exit 0
fi

echo "3) Login"
LOGIN=$(curl -fsSL --max-time "$TIMEOUT" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"senha\":\"$PASSWORD\"}")
TOKEN=$(printf '%s' "$LOGIN" | json_get data.accessToken)
if [[ -z "$TOKEN" ]]; then
  echo "❌ Não foi possível obter token de autenticação"
  echo "$LOGIN"
  exit 1
fi
echo "✓ Login OK"

echo "4) SGSO legado"
STATUS=$(api_get '/api/sgso/relatos?limit=1' "$TMP_DIR/relatos.json")
assert_success_json 'Listagem de relatos SGSO' "$STATUS" "$TMP_DIR/relatos.json"
STATUS=$(api_get '/api/sgso/kpi/spi' "$TMP_DIR/kpi.json")
assert_success_json 'KPIs SPI SGSO' "$STATUS" "$TMP_DIR/kpi.json"

echo "5) RELPREV next-gen"
STATUS=$(api_get '/api/sgso/relprev/submissoes?limit=5' "$TMP_DIR/relprev.json")
assert_success_json 'Listagem RELPREV' "$STATUS" "$TMP_DIR/relprev.json"

echo "6) Matriz de risco"
STATUS=$(api_get '/api/sgso/matriz-risco/perfis' "$TMP_DIR/matriz.json")
assert_success_json 'Perfis de matriz de risco' "$STATUS" "$TMP_DIR/matriz.json"

echo "7) Bowtie"
STATUS=$(api_get '/api/sgso/bowtie/cenarios' "$TMP_DIR/bowtie.json")
assert_success_json 'Listagem Bowtie' "$STATUS" "$TMP_DIR/bowtie.json"

echo "8) FRAT"
STATUS=$(api_get '/api/sgso/frat/modelos' "$TMP_DIR/frat-modelos.json")
assert_success_json 'Modelos FRAT' "$STATUS" "$TMP_DIR/frat-modelos.json"
STATUS=$(api_get '/api/sgso/frat/avaliacoes' "$TMP_DIR/frat-avaliacoes.json")
assert_success_json 'Avaliações FRAT' "$STATUS" "$TMP_DIR/frat-avaliacoes.json"

echo "✅ Smoke test SGSO concluído"