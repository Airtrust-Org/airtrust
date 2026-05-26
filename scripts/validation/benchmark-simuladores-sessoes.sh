#!/usr/bin/env bash

set -euo pipefail

BASE="${BASE:-https://api.airtrust.online}"
ENDPOINT="${ENDPOINT:-/api/simuladores/sessoes}"
LIMIT="${LIMIT:-100}"
OFFSET="${OFFSET:-0}"
ROUNDS="${ROUNDS:-3}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-30}"
DATA_INICIO="${DATA_INICIO:-}"
DATA_FIM="${DATA_FIM:-}"
AUTH_BEARER="${AUTH_BEARER:-}"
SMOKE_EMAIL="${SMOKE_EMAIL:-${AIRTRUST_SMOKE_EMAIL:-}}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-${AIRTRUST_SMOKE_PASSWORD:-}}"

if ! [[ "$LIMIT" =~ ^[0-9]+$ ]]; then
  echo "LIMIT inválido: $LIMIT" >&2
  exit 1
fi

if ! [[ "$OFFSET" =~ ^[0-9]+$ ]]; then
  echo "OFFSET inválido: $OFFSET" >&2
  exit 1
fi

if ! [[ "$ROUNDS" =~ ^[0-9]+$ ]] || [[ "$ROUNDS" -lt 1 ]]; then
  echo "ROUNDS inválido: $ROUNDS" >&2
  exit 1
fi

BASE="${BASE%/}"

if [[ -z "$AUTH_BEARER" && -n "$SMOKE_EMAIL" && -n "$SMOKE_PASSWORD" ]]; then
  login_payload=$(printf '{"email":"%s","senha":"%s"}' "$SMOKE_EMAIL" "$SMOKE_PASSWORD")
  login_response=$(
    curl -sS \
      --max-time "$TIMEOUT_SECONDS" \
      -H "Content-Type: application/json" \
      -X POST \
      "${BASE}/api/auth/login" \
      -d "$login_payload" || true
  )
  AUTH_BEARER=$(
    python3 - <<'PY' "$login_response"
import json
import sys

raw = sys.argv[1]
try:
    payload = json.loads(raw)
except Exception:
    print("")
    raise SystemExit(0)

token = ""
if isinstance(payload, dict):
    data = payload.get("data")
    if isinstance(data, dict):
        token = data.get("accessToken") or ""
print(token)
PY
  )
fi

build_url() {
  local mode="$1"
  local qs="limit=${LIMIT}&offset=${OFFSET}"

  if [[ -n "$DATA_INICIO" ]]; then
    qs+="&data_inicio=${DATA_INICIO}"
  fi
  if [[ -n "$DATA_FIM" ]]; then
    qs+="&data_fim=${DATA_FIM}"
  fi
  if [[ "$mode" == "summary" ]]; then
    qs+="&view=summary"
  fi

  echo "${BASE}${ENDPOINT}?${qs}"
}

run_case() {
  local mode="$1"
  local url
  url="$(build_url "$mode")"

  local tmp_body tmp_headers tmp_meta
  tmp_body="$(mktemp)"
  tmp_headers="$(mktemp)"
  tmp_meta="$(mktemp)"

  trap 'rm -f "$tmp_body" "$tmp_headers" "$tmp_meta"' RETURN

  if [[ -n "$AUTH_BEARER" ]]; then
    curl -sS \
      --max-time "$TIMEOUT_SECONDS" \
      -H "Accept: application/json" \
      -H "Authorization: Bearer ${AUTH_BEARER}" \
      -D "$tmp_headers" \
      -o "$tmp_body" \
      -w "http_code=%{http_code} time_total=%{time_total} size_download=%{size_download}\\n" \
      "$url" > "$tmp_meta"
  else
    curl -sS \
      --max-time "$TIMEOUT_SECONDS" \
      -H "Accept: application/json" \
      -D "$tmp_headers" \
      -o "$tmp_body" \
      -w "http_code=%{http_code} time_total=%{time_total} size_download=%{size_download}\\n" \
      "$url" > "$tmp_meta"
  fi

  python3 - "$mode" "$url" "$tmp_meta" "$tmp_body" <<'PY'
import json
import re
import sys
from pathlib import Path

mode = sys.argv[1]
url = sys.argv[2]
meta = Path(sys.argv[3]).read_text().strip()
body = Path(sys.argv[4]).read_text(errors='replace')

http_code = ''
time_total = ''
size_download = ''
for key, value in re.findall(r'(http_code|time_total|size_download)=([^\s]+)', meta):
    if key == 'http_code':
        http_code = value
    elif key == 'time_total':
        time_total = value
    elif key == 'size_download':
        size_download = value

success = None
has_pagination = None
data_count = None
error = None
request_id = None

try:
    payload = json.loads(body)
    if isinstance(payload, dict):
        success = payload.get('success')
        has_pagination = isinstance(payload.get('pagination'), dict)
        data = payload.get('data')
        if isinstance(data, list):
            data_count = len(data)
        error = payload.get('error') or payload.get('code')
        request_id = payload.get('requestId')
except Exception:
    payload = None

auth_required = http_code in {'401', '403'}

print(
    f"mode={mode} http_code={http_code} time_total={time_total} size_download={size_download} "
    f"success={success} has_pagination={has_pagination} data_count={data_count} "
    f"error={error} auth_required={auth_required} request_id={request_id}"
)
print(f"url={url}")
PY

  rm -f "$tmp_body" "$tmp_headers" "$tmp_meta"
  trap - RETURN
}

echo "=== benchmark-simuladores-sessoes ==="
echo "base=$BASE"
echo "endpoint=$ENDPOINT"
echo "limit=$LIMIT offset=$OFFSET rounds=$ROUNDS timeout=${TIMEOUT_SECONDS}s"
if [[ -n "$DATA_INICIO" || -n "$DATA_FIM" ]]; then
  echo "window=${DATA_INICIO:-<none>}..${DATA_FIM:-<none>}"
fi
if [[ -z "$AUTH_BEARER" ]]; then
  echo "auth=none"
else
  echo "auth=bearer-present"
fi

echo
for ((i = 1; i <= ROUNDS; i++)); do
  echo "--- round ${i}/${ROUNDS} default ---"
  run_case "default"
  echo
  echo "--- round ${i}/${ROUNDS} summary ---"
  run_case "summary"
  echo
  sleep 1
done

cat <<'TXT'
Interpretation hints:
- auth_required=true: endpoint protegido; benchmark funcional precisa token válido.
- compare default vs summary por time_total e size_download quando success=true.
- este script é read-only (somente GET).
TXT
