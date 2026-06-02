#!/usr/bin/env bash
set -euo pipefail

if [[ "$-" == *x* ]]; then
  printf '[AUTH][ERROR] xtrace (-x) habilitado. Desative antes de continuar.\n' >&2
  exit 1
fi

AIRTRUST_BASE_URL="${AIRTRUST_BASE_URL:-https://api.airtrust.online}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SMOKE_SCRIPT="$SCRIPT_DIR/smoke-authenticated-operational.sh"

LOGIN_BODY_FILE="$(mktemp)"
LOGIN_HEADERS_FILE="$(mktemp)"

cleanup() {
  rm -f "$LOGIN_BODY_FILE" "$LOGIN_HEADERS_FILE"
  unset AIRTRUST_LOGIN AIRTRUST_PASSWORD AIRTRUST_AUTH_TOKEN AIRTRUST_COOKIE
}

log() {
  printf '[AUTH] %s\n' "$*"
}

fail_log() {
  printf '[AUTH][ERROR] %s\n' "$*" >&2
}

extract_auth_material() {
  local body_file="$1"
  local headers_file="$2"

  node - "$body_file" "$headers_file" <<'NODE'
const fs = require('node:fs');

const bodyFile = process.argv[2];
const headersFile = process.argv[3];

let authMode = '';
let authValue = '';

try {
  const raw = fs.readFileSync(bodyFile, 'utf8').trim();
  if (raw) {
    const payload = JSON.parse(raw);
    const token =
      payload?.data?.accessToken ??
      payload?.data?.access_token ??
      payload?.accessToken ??
      payload?.access_token ??
      '';
    if (typeof token === 'string' && token.trim()) {
      authMode = 'token';
      authValue = token.trim();
    }
  }
} catch {}

if (!authMode) {
  try {
    const headerLines = fs.readFileSync(headersFile, 'utf8').split(/\r?\n/);
    const pairs = [];
    for (const line of headerLines) {
      const match = line.match(/^set-cookie:\s*([^=;,\s]+)=([^;]*)/i);
      if (match && match[1] && match[2]) {
        pairs.push(`${match[1]}=${match[2]}`);
      }
    }
    if (pairs.length > 0) {
      authMode = 'cookie';
      authValue = pairs.join('; ');
    }
  } catch {}
}

if (!authMode || !authValue) {
  process.exit(1);
}

process.stdout.write(`${authMode}\n${authValue}`);
NODE
}

main() {
  if [[ ! -x "$SMOKE_SCRIPT" && ! -f "$SMOKE_SCRIPT" ]]; then
    fail_log "script de smoke autenticado nao encontrado em $SMOKE_SCRIPT"
    exit 1
  fi

  read -r -p "Email/login AirTrust: " AIRTRUST_LOGIN
  read -r -s -p "Senha AirTrust: " AIRTRUST_PASSWORD
  printf '\n'

  if [[ -z "${AIRTRUST_LOGIN:-}" || -z "${AIRTRUST_PASSWORD:-}" ]]; then
    fail_log "email/login e senha sao obrigatorios"
    exit 1
  fi

  local login_payload
  login_payload="$(node -e 'const [, email, senha] = process.argv; process.stdout.write(JSON.stringify({ email, senha }));' -- "$AIRTRUST_LOGIN" "$AIRTRUST_PASSWORD")"

  log "Iniciando login efemero em ${AIRTRUST_BASE_URL%/}/api/auth/login"
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

  if [[ "$http_code" != "200" ]]; then
    fail_log "login falhou com HTTP $http_code"
    exit 1
  fi

  local parsed auth_mode auth_value
  if ! parsed="$(extract_auth_material "$LOGIN_BODY_FILE" "$LOGIN_HEADERS_FILE" 2>/dev/null)"; then
    fail_log "login retornou 200, mas nao expos token nem cookie utilizavel"
    exit 1
  fi

  auth_mode="$(printf '%s\n' "$parsed" | sed -n '1p')"
  auth_value="$(printf '%s\n' "$parsed" | sed -n '2p')"

  if [[ -z "$auth_mode" || -z "$auth_value" ]]; then
    fail_log "material de autenticacao invalido"
    exit 1
  fi

  case "$auth_mode" in
    token)
      export AIRTRUST_AUTH_TOKEN="$auth_value"
      log "AUTH_MODE=token"
      ;;
    cookie)
      export AIRTRUST_COOKIE="$auth_value"
      log "AUTH_MODE=cookie"
      ;;
    *)
      fail_log "modo de autenticacao nao suportado"
      exit 1
      ;;
  esac

  log "LOGIN_OK"
  log "SMOKE_START"
  bash "$SMOKE_SCRIPT"
  log "SMOKE_DONE"
}

trap cleanup EXIT

main "$@"
