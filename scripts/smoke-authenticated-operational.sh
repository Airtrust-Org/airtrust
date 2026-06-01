#!/usr/bin/env bash
set -euo pipefail

AIRTRUST_BASE_URL="${AIRTRUST_BASE_URL:-https://api.airtrust.online}"
AIRTRUST_PUBLIC_ONLY="${AIRTRUST_PUBLIC_ONLY:-NO}"
AIRTRUST_ALLOW_SMOKE_WRITES="${AIRTRUST_ALLOW_SMOKE_WRITES:-NO}"
AIRTRUST_CONFIRM_PROD_SMOKE_WRITES="${AIRTRUST_CONFIRM_PROD_SMOKE_WRITES:-}"
AIRTRUST_RUN_FRMS_FAIL_SAFE="${AIRTRUST_RUN_FRMS_FAIL_SAFE:-NO}"

PROD_WRITE_CONFIRM_TEXT="I understand this will create test data in production"

log() {
  printf '[SMOKE] %s\n' "$*"
}

fail() {
  printf '[SMOKE][ERROR] %s\n' "$*" >&2
  exit 1
}

is_yes() {
  [[ "$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')" == "YES" ]]
}

is_production_url() {
  [[ "$AIRTRUST_BASE_URL" == *"api.airtrust.online"* ]]
}

build_curl_args() {
  local auth_required="$1"
  local -a args
  args=(
    -sS
    --connect-timeout 15
    --max-time 60
    -H "Accept: application/json"
  )

  if [[ "$auth_required" == "yes" ]]; then
    if [[ -n "${AIRTRUST_AUTH_TOKEN:-}" ]]; then
      args+=( -H "Authorization: Bearer ${AIRTRUST_AUTH_TOKEN}" )
    fi
    if [[ -n "${AIRTRUST_COOKIE:-}" ]]; then
      args+=( -H "Cookie: ${AIRTRUST_COOKIE}" )
    fi
  fi

  printf '%s\n' "${args[@]}"
}

run_request() {
  local label="$1"
  local method="$2"
  local path="$3"
  local expected_csv="$4"
  local auth_required="$5"
  local payload="${6:-}"

  local url="${AIRTRUST_BASE_URL%/}${path}"
  local tmp
  tmp="$(mktemp)"

  local -a args
  while IFS= read -r line; do
    args+=("$line")
  done < <(build_curl_args "$auth_required")

  args+=( -X "$method" )

  if [[ -n "$payload" ]]; then
    args+=( -H "Content-Type: application/json" --data "$payload" )
  fi

  log "$label [$method $path]"
  local http_code
  http_code="$(curl "${args[@]}" -o "$tmp" -w '%{http_code}' "$url" || true)"

  local expected_ok="no"
  IFS=',' read -r -a expected_codes <<< "$expected_csv"
  for code in "${expected_codes[@]}"; do
    if [[ "$http_code" == "$code" ]]; then
      expected_ok="yes"
      break
    fi
  done

  if [[ "$expected_ok" != "yes" ]]; then
    log "Resposta (até 400 chars): $(tr '\n' ' ' < "$tmp" | head -c 400)"
    rm -f "$tmp"
    fail "$label retornou HTTP $http_code (esperado: $expected_csv)"
  fi

  log "$label OK (HTTP $http_code)"
  rm -f "$tmp"
}

ensure_auth_config() {
  if [[ -n "${AIRTRUST_AUTH_TOKEN:-}" || -n "${AIRTRUST_COOKIE:-}" ]]; then
    return 0
  fi

  fail "Credencial ausente. Defina AIRTRUST_AUTH_TOKEN (Bearer) ou AIRTRUST_COOKIE. Para smoke público use AIRTRUST_PUBLIC_ONLY=YES."
}

guard_writes() {
  if ! is_yes "$AIRTRUST_ALLOW_SMOKE_WRITES"; then
    log "Mutações seguras: SKIPPED (AIRTRUST_ALLOW_SMOKE_WRITES != YES)"
    return 1
  fi

  if is_production_url; then
    if [[ "$AIRTRUST_CONFIRM_PROD_SMOKE_WRITES" != "$PROD_WRITE_CONFIRM_TEXT" ]]; then
      fail "Writes em produção bloqueados. Para liberar, defina AIRTRUST_CONFIRM_PROD_SMOKE_WRITES exatamente como: $PROD_WRITE_CONFIRM_TEXT"
    fi
  fi

  return 0
}

smoke_public_only() {
  log "Categoria: read-only público"
  run_request "Version" "GET" "/api/version" "200" "no"
  run_request "Health" "GET" "/api/health" "200" "no"
  log "Smoke public-only concluído"
}

smoke_authenticated_read_only() {
  log "Categoria: read-only autenticado"
  run_request "Auth me" "GET" "/api/auth/me" "200" "yes"
  run_request "Auth empresas" "GET" "/api/auth/empresas" "200" "yes"

  run_request "FRMS daily fatigue" "GET" "/api/frms/daily-fatigue" "200" "yes"
  run_request "EVD daily" "GET" "/api/evd?data=$(date +%F)" "200" "yes"
  run_request "Simuladores sessoes" "GET" "/api/simuladores/sessoes?limit=1" "200" "yes"
  run_request "Qualificacoes historico" "GET" "/api/qualificacoes/historico?limit=1" "200" "yes"

  log "Read-only autenticado concluído"
}

smoke_frms_fail_safe() {
  if ! is_yes "$AIRTRUST_RUN_FRMS_FAIL_SAFE"; then
    log "FRMS fail-safe: SKIPPED (AIRTRUST_RUN_FRMS_FAIL_SAFE != YES)"
    return 0
  fi

  if ! guard_writes; then
    log "FRMS fail-safe: SKIPPED (writes não autorizados)"
    return 0
  fi

  log "Categoria: mutation segura (FRMS fail-safe, espera erro de validação)"

  run_request "FRMS fail-safe missing wake_time" "POST" "/api/frms/daily-fatigue" "400,422" "yes" '{"fit_for_duty":true,"horas_sono_24h":6,"qualidade_sono":4,"kss_score":3,"aceite_termos":true,"aceite_privacidade":true}'

  run_request "FRMS fail-safe missing sleep data" "POST" "/api/frms/daily-fatigue" "400,422" "yes" '{"wake_time":"07:00","fit_for_duty":true,"qualidade_sono":4,"kss_score":3,"aceite_termos":true,"aceite_privacidade":true}'

  run_request "FRMS fail-safe missing fit_for_duty" "POST" "/api/frms/daily-fatigue" "400,422" "yes" '{"wake_time":"07:00","horas_sono_24h":6,"qualidade_sono":4,"kss_score":3,"aceite_termos":true,"aceite_privacidade":true}'

  log "FRMS fail-safe concluído"
}

main() {
  log "Base URL: $AIRTRUST_BASE_URL"
  log "Writes habilitados: $AIRTRUST_ALLOW_SMOKE_WRITES"

  if is_yes "$AIRTRUST_PUBLIC_ONLY"; then
    smoke_public_only
    exit 0
  fi

  ensure_auth_config

  run_request "Version" "GET" "/api/version" "200" "no"
  run_request "Health" "GET" "/api/health" "200" "no"

  smoke_authenticated_read_only
  smoke_frms_fail_safe

  log "Mutações proibidas por padrão: não executadas"
  log "Smoke autenticado operacional concluído"
}

main "$@"
