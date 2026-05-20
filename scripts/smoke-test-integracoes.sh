#!/usr/bin/env bash
set -euo pipefail

WEB_BASE="${WEB_BASE:-https://airtrust.online}"
API_BASE="${API_BASE:-https://airtrust-api-production.airtrust.workers.dev}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
AERONAVE_ID="${AERONAVE_ID:-}"
ESCALA_ID="${ESCALA_ID:-}"
FUNCIONARIO_ID="${FUNCIONARIO_ID:-}"

say() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Comando obrigatorio nao encontrado: $1" >&2
    exit 1
  }
}

http_check() {
  local label="$1"
  local url="$2"
  local extra_header="${3:-}"

  say "$label"
  if [[ -n "$extra_header" ]]; then
    curl -fsSL -H "$extra_header" "$url" >/tmp/airtrust-smoke.out
  else
    curl -fsSL "$url" >/tmp/airtrust-smoke.out
  fi

  head -c 600 /tmp/airtrust-smoke.out
  printf '\n'
}

require_cmd curl
require_cmd head

say "Pages build marker"
curl -fsSL "$WEB_BASE" | head -200 | grep -i "build-version" -n || true

http_check "Worker health" "$API_BASE/api/health"

if [[ -z "$AUTH_TOKEN" ]]; then
  say "AUTH_TOKEN ausente: pulando endpoints autenticados de integracao"
  exit 0
fi

AUTH_HEADER="Authorization: Bearer $AUTH_TOKEN"

if [[ -n "$AERONAVE_ID" ]]; then
  URL="$API_BASE/api/escalas/tripulantes-operacionais?aeronave_id=$AERONAVE_ID&incluir_bloqueados=true"
  if [[ -n "$ESCALA_ID" ]]; then
    URL+="&escala_id=$ESCALA_ID"
  fi
  http_check "Escalas tripulantes operacionais" "$URL" "$AUTH_HEADER"
else
  say "AERONAVE_ID ausente: pulando /api/escalas/tripulantes-operacionais"
fi

if [[ -n "$FUNCIONARIO_ID" ]]; then
  http_check \
    "Escalas tripulante operacional individual" \
    "$API_BASE/api/escalas/tripulantes-operacionais/$FUNCIONARIO_ID" \
    "$AUTH_HEADER"
else
  say "FUNCIONARIO_ID ausente: pulando /api/escalas/tripulantes-operacionais/:funcionarioId"
fi

if [[ -n "$ESCALA_ID" ]]; then
  http_check "Escala alertas" "$API_BASE/api/escalas/$ESCALA_ID/alertas" "$AUTH_HEADER"
else
  say "ESCALA_ID ausente: pulando /api/escalas/:id/alertas"
fi

say "Smoke test concluido"