#!/usr/bin/env bash
# smoke-auth-terminal-login.sh
# Obtém token efêmero via login, detecta empresa_id e executa o smoke autenticado.
# Aceita credenciais via env vars — sem hardcode, sem impressão de segredos.
#
# Uso:
#   export AIRTRUST_STAGING_EMAIL='usuario@empresa.com'
#   export AIRTRUST_STAGING_PASSWORD='senha_aqui'
#   export AIRTRUST_BASE_URL='https://airtrust-api-staging.airtrust.workers.dev'
#   bash scripts/smoke-auth-terminal-login.sh
#
# Variáveis opcionais:
#   AIRTRUST_EXPECTED_EMPRESA_ID   — se não set, detectado automaticamente via /api/auth/empresas
#   AIRTRUST_EXPECTED_EMPRESA_CODIGO — se não set, skip da validação
#
# NUNCA commitar este script com credenciais preenchidas.
set -euo pipefail

# Guard: bloqueia xtrace para não vazar credenciais nos logs
if [[ "$-" == *x* ]]; then
  printf '[AUTH][ERROR] xtrace (-x) ativo. Desative antes de continuar.\n' >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_SCRIPT="$SCRIPT_DIR/smoke-authenticated-operational.sh"
AIRTRUST_BASE_URL="${AIRTRUST_BASE_URL:-https://airtrust-api-staging.airtrust.workers.dev}"

LOGIN_BODY_FILE="$(mktemp)"
LOGIN_HEADERS_FILE="$(mktemp)"
EMPRESAS_FILE="$(mktemp)"

cleanup() {
  rm -f "$LOGIN_BODY_FILE" "$LOGIN_HEADERS_FILE" "$EMPRESAS_FILE"
  # Limpar credenciais efêmeras da memória do processo
  unset AIRTRUST_AUTH_TOKEN AIRTRUST_COOKIE _RAW_TOKEN _RAW_COOKIE
}

log() {
  printf '[SMOKE-AUTH] %s\n' "$*"
}

fail() {
  printf '[SMOKE-AUTH][ERROR] %s\n' "$*" >&2
  exit 1
}

# Extrai accessToken do body de login sem imprimir o valor
extract_token() {
  node - "$1" <<'NODE'
const fs = require('node:fs');
const raw = fs.readFileSync(process.argv[2], 'utf8').trim();
if (!raw) process.exit(1);
const payload = JSON.parse(raw);
const token =
  payload?.data?.accessToken ??
  payload?.data?.access_token ??
  payload?.accessToken ??
  payload?.access_token ?? '';
if (!token || typeof token !== 'string') process.exit(1);
process.stdout.write(token.trim());
NODE
}

# Extrai primeiro empresa_id da resposta de /api/auth/empresas
extract_empresa_id() {
  node - "$1" <<'NODE'
const fs = require('node:fs');
const raw = fs.readFileSync(process.argv[2], 'utf8').trim();
if (!raw) process.exit(1);
const payload = JSON.parse(raw);
const arr = Array.isArray(payload?.data)
  ? payload.data
  : Array.isArray(payload?.data?.empresas)
    ? payload.data.empresas
    : Array.isArray(payload?.empresas)
      ? payload.empresas
      : [];
const empresa =
  arr.find(e => e?.is_current === 1 || e?.is_current === true) ??
  arr.find(e => e?.is_primary === 1 || e?.is_primary === true) ??
  arr[0];
const id = empresa?.id ?? empresa?.empresa_id ?? '';
if (!id) process.exit(1);
process.stdout.write(String(id));
NODE
}

main() {
  if [[ ! -f "$SMOKE_SCRIPT" ]]; then
    fail "smoke-authenticated-operational.sh não encontrado em $SMOKE_SCRIPT"
  fi

  # Verificar credenciais em env — não aceita hardcode
  local email="${AIRTRUST_STAGING_EMAIL:-}"
  local senha="${AIRTRUST_STAGING_PASSWORD:-}"

  if [[ -z "$email" || -z "$senha" ]]; then
    printf '\n[SMOKE-AUTH] Credenciais efêmeras ausentes. Exporte antes de executar:\n\n'
    printf '  export AIRTRUST_STAGING_EMAIL="usuario@empresa.com"\n'
    printf '  export AIRTRUST_STAGING_PASSWORD="senha_aqui"\n'
    printf '  export AIRTRUST_BASE_URL="https://airtrust-api-staging.airtrust.workers.dev"\n'
    printf '  bash scripts/smoke-auth-terminal-login.sh\n\n'
    printf 'AUTHENTICATED_SMOKE=BLOCKED_BY_MISSING_TERMINAL_CREDENTIAL\n'
    exit 1
  fi

  log "Base URL: $AIRTRUST_BASE_URL"
  log "Iniciando login efêmero (credencial não impressa)"

  # Login — payload montado via node para escapar JSON com segurança
  local login_payload
  login_payload="$(node -e \
    'const [,e,s]=process.argv; process.stdout.write(JSON.stringify({email:e,password:s}));' \
    -- "$email" "$senha")"

  local http_code
  http_code="$(curl \
    -sS \
    --connect-timeout 15 \
    --max-time 60 \
    -o "$LOGIN_BODY_FILE" \
    -D "$LOGIN_HEADERS_FILE" \
    -w '%{http_code}' \
    -X POST \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/json' \
    --data "$login_payload" \
    "${AIRTRUST_BASE_URL%/}/api/auth/login" || true)"

  # Limpar payload de login da memória
  unset login_payload

  if [[ "$http_code" != "200" ]]; then
    fail "Login falhou: HTTP $http_code"
  fi

  local _RAW_TOKEN
  if ! _RAW_TOKEN="$(extract_token "$LOGIN_BODY_FILE" 2>/dev/null)"; then
    fail "Login retornou 200 mas sem accessToken utilizável"
  fi

  export AIRTRUST_AUTH_TOKEN="$_RAW_TOKEN"
  unset _RAW_TOKEN
  log "LOGIN_OK AUTH_MODE=bearer-token (token não impresso)"

  # Detectar empresa_id se não fornecido
  if [[ -z "${AIRTRUST_EXPECTED_EMPRESA_ID:-}" ]]; then
    log "Detectando empresa_id via /api/auth/empresas"
    local empresa_http
    empresa_http="$(curl \
      -sS \
      --connect-timeout 15 \
      --max-time 30 \
      -o "$EMPRESAS_FILE" \
      -w '%{http_code}' \
      -H "Authorization: Bearer ${AIRTRUST_AUTH_TOKEN}" \
      -H 'Accept: application/json' \
      "${AIRTRUST_BASE_URL%/}/api/auth/empresas" || true)"

    if [[ "$empresa_http" == "200" ]]; then
      local detected_id
      if detected_id="$(extract_empresa_id "$EMPRESAS_FILE" 2>/dev/null)" && [[ -n "$detected_id" ]]; then
        export AIRTRUST_EXPECTED_EMPRESA_ID="$detected_id"
        log "empresa_id_detected=$detected_id"
      else
        log "WARN: empresa_id não detectado — validação de empresa será SKIPPED"
      fi
    else
      log "WARN: /api/auth/empresas retornou HTTP $empresa_http — validação de empresa será SKIPPED"
    fi
  else
    log "empresa_id_from_env=$AIRTRUST_EXPECTED_EMPRESA_ID"
  fi

  export AIRTRUST_BASE_URL
  log "SMOKE_START"
  bash "$SMOKE_SCRIPT"
  log "SMOKE_DONE"
}

trap cleanup EXIT

main "$@"
