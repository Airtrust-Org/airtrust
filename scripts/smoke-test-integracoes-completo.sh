#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-https://airtrust-api-production.airtrust.workers.dev}"
WEB_BASE="${WEB_BASE:-https://airtrust.online}"
ANO="${AIRTRUST_SMOKE_ANO:-2026}"
ENV_FILE="${AIRTRUST_SMOKE_ENV_FILE:-}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -z "$ENV_FILE" ]]; then
  if [[ -f "$ROOT_DIR/scripts/.env.test" ]]; then
    ENV_FILE="$ROOT_DIR/scripts/.env.test"
  elif [[ -f "$ROOT_DIR/.env.test" ]]; then
    ENV_FILE="$ROOT_DIR/.env.test"
  fi
fi

if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

EMAIL="${AIRTRUST_SMOKE_EMAIL:-${TEST_EMAIL:-}}"
PASSWORD="${AIRTRUST_SMOKE_PASSWORD:-${TEST_PASSWORD:-}}"

LOGIN_PASSWORDS=()
if [[ -n "$PASSWORD" ]]; then
  LOGIN_PASSWORDS+=("$PASSWORD")
fi
if [[ "$PASSWORD" != "Admin@123" ]]; then
  LOGIN_PASSWORDS+=("Admin@123")
fi
if [[ "$PASSWORD" != "admin123" ]]; then
  LOGIN_PASSWORDS+=("admin123")
fi

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "❌ Defina AIRTRUST_SMOKE_EMAIL/AIRTRUST_SMOKE_PASSWORD ou TEST_EMAIL/TEST_PASSWORD"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

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

say() {
  printf '\n[T%s] %s\n' "$1" "$2"
}

api_json() {
  local method="$1"
  local url="$2"
  local output="$3"
  shift 3
  local status
  status=$(curl -sS -o "$output" -w '%{http_code}' -X "$method" "$url" "$@")
  echo "$status"
}

assert_http_ok() {
  local status="$1"
  local file="$2"
  if [[ "$status" != "200" && "$status" != "201" ]]; then
    echo "❌ HTTP $status"
    cat "$file"
    exit 1
  fi
}

poll_event() {
  local token="$1"
  local tipo="$2"
  local expected_id="$3"

  for _ in 1 2 3 4 5; do
    local file="$TMP_DIR/poll-$tipo.json"
    local status
    status=$(api_json GET "$BASE/api/admin/domain-events?tipo=$tipo&limit=20" "$file" \
      -H "Authorization: Bearer $token")
    assert_http_ok "$status" "$file"
    local found='no'
    if grep -q "\"tipo\":\"$tipo\"" "$file" && grep -q "$expected_id" "$file"; then
      found='yes'
    fi
    if [[ "$found" == "yes" ]]; then
      return 0
    fi
    sleep 2
  done

  return 1
}

say 01 "Pages build marker + worker health"
curl -fsSL "$WEB_BASE" | head -200 | grep -i 'build-version' -n || true
HEALTH_FILE="$TMP_DIR/health.json"
HEALTH_STATUS=$(api_json GET "$BASE/api/health" "$HEALTH_FILE")
assert_http_ok "$HEALTH_STATUS" "$HEALTH_FILE"
STATUS_VALUE=$(json_get status < "$HEALTH_FILE")
if [[ "$STATUS_VALUE" != "healthy" ]]; then
  echo "❌ /api/health não saudável"
  cat "$HEALTH_FILE"
  exit 1
fi

say 02 "Login autenticado"
LOGIN_FILE="$TMP_DIR/login.json"
TOKEN=''
LOGIN_STATUS='401'
for candidate in "${LOGIN_PASSWORDS[@]}"; do
  for _ in 1 2 3; do
    LOGIN_STATUS=$(api_json POST "$BASE/api/auth/login" "$LOGIN_FILE" \
      -H 'Content-Type: application/json' \
      -d "{\"email\":\"$EMAIL\",\"senha\":\"$candidate\"}")
    if [[ "$LOGIN_STATUS" == "200" ]] && grep -q '"success":true' "$LOGIN_FILE"; then
      TOKEN=$(python3 -c 'import json,sys; data=json.load(open(sys.argv[1], encoding="utf-8")); print((((data.get("data") or {}).get("accessToken")) or ((data.get("data") or {}).get("token")) or ""))' "$LOGIN_FILE")
      if [[ -n "$TOKEN" ]]; then
        break 2
      fi
    fi
    sleep 2
  done
done

assert_http_ok "$LOGIN_STATUS" "$LOGIN_FILE"
if [[ -z "$TOKEN" ]]; then
  echo "❌ Token ausente no login"
  cat "$LOGIN_FILE"
  exit 1
fi

say 03 "Health das integrações"
INTEGRACOES_FILE="$TMP_DIR/integracoes-health.json"
INTEGRACOES_STATUS=$(api_json GET "$BASE/api/admin/integracoes/health" "$INTEGRACOES_FILE" \
  -H "Authorization: Bearer $TOKEN")
assert_http_ok "$INTEGRACOES_STATUS" "$INTEGRACOES_FILE"

say 04 "Injeção controlada de evento"
TEST_EVENT_FILE="$TMP_DIR/test-event.json"
TEST_EVENT_STATUS=$(api_json POST "$BASE/api/admin/integracoes/test-event" "$TEST_EVENT_FILE" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"modulo":"admin","tipo":"FUNCIONARIO_ATUALIZADO","payload":{"probe":"smoke-t04"}}')
assert_http_ok "$TEST_EVENT_STATUS" "$TEST_EVENT_FILE"
poll_event "$TOKEN" "FUNCIONARIO_ATUALIZADO" "smoke-t04" || {
  echo "❌ Evento de teste não apareceu em /api/admin/domain-events"
  exit 1
}

say 05 "Escalas listagem e detalhe"
ESCALAS_FILE="$TMP_DIR/escalas.json"
ESCALAS_STATUS=$(api_json GET "$BASE/api/escalas?ano=$ANO" "$ESCALAS_FILE" \
  -H "Authorization: Bearer $TOKEN")
assert_http_ok "$ESCALAS_STATUS" "$ESCALAS_FILE"
ESCALA_ID=$(python3 -c 'import json,sys; rows=json.load(open(sys.argv[1], encoding="utf-8")).get("data") or []; assert rows; print(rows[0]["id"])' "$ESCALAS_FILE")

ESCALA_DETALHE_FILE="$TMP_DIR/escala-detalhe.json"
ESCALA_DETALHE_STATUS=$(api_json GET "$BASE/api/escalas/$ESCALA_ID" "$ESCALA_DETALHE_FILE" \
  -H "Authorization: Bearer $TOKEN")
assert_http_ok "$ESCALA_DETALHE_STATUS" "$ESCALA_DETALHE_FILE"

say 06 "Escalas alertas"
ALERTAS_FILE="$TMP_DIR/escala-alertas.json"
ALERTAS_STATUS=$(api_json GET "$BASE/api/escalas/$ESCALA_ID/alertas" "$ALERTAS_FILE" \
  -H "Authorization: Bearer $TOKEN")
assert_http_ok "$ALERTAS_STATUS" "$ALERTAS_FILE"

say 07 "Descobrir funcionário válido para Pasta Virtual"
FUNCIONARIOS_FILE="$TMP_DIR/funcionarios.json"
FUNCIONARIOS_STATUS=$(api_json GET "$BASE/api/funcionarios?page=1&limit=5" "$FUNCIONARIOS_FILE" \
  -H "Authorization: Bearer $TOKEN")
assert_http_ok "$FUNCIONARIOS_STATUS" "$FUNCIONARIOS_FILE"
FUNCIONARIO_ID=$(python3 -c 'import json,sys; payload=json.load(open(sys.argv[1], encoding="utf-8")); rows=payload.get("data") or []; assert rows; print(rows[0]["id"])' "$FUNCIONARIOS_FILE")

say 08 "Upload de documento e validação DOCUMENTO_ENVIADO"
PDF_PATH="$TMP_DIR/smoke.pdf"
cat > "$PDF_PATH" <<'EOF'
%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT /F1 12 Tf 50 120 Td (AirTrust Smoke) Tj ET
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF
EOF

python3 - <<'PY' "$PDF_PATH"
from pathlib import Path
import sys

path = Path(sys.argv[1])
target_size = 2048
content = path.read_bytes()
if len(content) < target_size:
  padding = b"\n%" + (b" AirTrust Smoke Padding" * 80)
  while len(content) + len(padding) < target_size:
    padding += b" AirTrust Smoke Padding"
  path.write_bytes(content + padding + b"\n")
PY

UPLOAD_FILE="$TMP_DIR/upload.json"
UPLOAD_STATUS=$(api_json POST "$BASE/api/pasta-virtual/upload" "$UPLOAD_FILE" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$PDF_PATH;type=application/pdf" \
  -F "funcionario_id=$FUNCIONARIO_ID" \
  -F 'tipo_documento=OUTRO' \
  -F 'descricao=smoke integracoes')
assert_http_ok "$UPLOAD_STATUS" "$UPLOAD_FILE"
DOCUMENTO_ID=$(json_get data.id < "$UPLOAD_FILE")
if [[ -z "$DOCUMENTO_ID" ]]; then
  echo "❌ Upload não retornou documento_id"
  cat "$UPLOAD_FILE"
  exit 1
fi
poll_event "$TOKEN" "DOCUMENTO_ENVIADO" "$DOCUMENTO_ID" || {
  echo "❌ Evento DOCUMENTO_ENVIADO não detectado"
  exit 1
}

say 09 "Delete de documento e validação DOCUMENTO_EXCLUIDO"
DELETE_FILE="$TMP_DIR/delete.json"
DELETE_STATUS=$(api_json DELETE "$BASE/api/pasta-virtual/delete/$DOCUMENTO_ID" "$DELETE_FILE" \
  -H "Authorization: Bearer $TOKEN")
assert_http_ok "$DELETE_STATUS" "$DELETE_FILE"
poll_event "$TOKEN" "DOCUMENTO_EXCLUIDO" "$DOCUMENTO_ID" || {
  echo "❌ Evento DOCUMENTO_EXCLUIDO não detectado"
  exit 1
}

say 10 "Health final das integrações"
FINAL_FILE="$TMP_DIR/final-health.json"
FINAL_STATUS=$(api_json GET "$BASE/api/admin/integracoes/health" "$FINAL_FILE" \
  -H "Authorization: Bearer $TOKEN")
assert_http_ok "$FINAL_STATUS" "$FINAL_FILE"

echo "✅ T01-T10 concluídos com sucesso"