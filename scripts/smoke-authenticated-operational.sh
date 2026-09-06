#!/usr/bin/env bash
set -euo pipefail

AIRTRUST_BASE_URL="${AIRTRUST_BASE_URL:-https://api.airtrust.online}"
AIRTRUST_PUBLIC_ONLY="${AIRTRUST_PUBLIC_ONLY:-NO}"
AIRTRUST_ALLOW_SMOKE_WRITES="${AIRTRUST_ALLOW_SMOKE_WRITES:-NO}"
AIRTRUST_CONFIRM_PROD_SMOKE_WRITES="${AIRTRUST_CONFIRM_PROD_SMOKE_WRITES:-}"
AIRTRUST_RUN_FRMS_FAIL_SAFE="${AIRTRUST_RUN_FRMS_FAIL_SAFE:-NO}"
AIRTRUST_EXPECTED_EMPRESA_ID="${AIRTRUST_EXPECTED_EMPRESA_ID:-}"
AIRTRUST_EXPECTED_EMPRESA_CODIGO="${AIRTRUST_EXPECTED_EMPRESA_CODIGO:-}"
AIRTRUST_RUN_RDV_QUEUE_SMOKE="${AIRTRUST_RUN_RDV_QUEUE_SMOKE:-NO}"

PROD_WRITE_CONFIRM_TEXT="I understand this will create test data in production"

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
LAST_RESPONSE_FILE=""

log() {
  printf '[SMOKE] %s\n' "$*"
}

fail_log() {
  printf '[SMOKE][ERROR] %s\n' "$*" >&2
}

is_yes() {
  [[ "$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')" == "YES" ]]
}

is_production_url() {
  [[ "$AIRTRUST_BASE_URL" == *"api.airtrust.online"* ]]
}

record_pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  log "$1: PASS${2:+ ($2)}"
}

record_fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  fail_log "$1: FAIL${2:+ ($2)}"
}

record_skip() {
  SKIP_COUNT=$((SKIP_COUNT + 1))
  log "$1: $2${3:+ ($3)}"
}

sanitize_body() {
  local file="$1"
  tr '\n' ' ' < "$file" |
    sed -E \
      -e 's/"email"[[:space:]]*:[[:space:]]*"[^"]*"/"email":"[redacted]"/g' \
      -e 's/"nome"[[:space:]]*:[[:space:]]*"[^"]*"/"nome":"[redacted]"/g' \
      -e 's/"name"[[:space:]]*:[[:space:]]*"[^"]*"/"name":"[redacted]"/g' \
      -e 's/"token"[[:space:]]*:[[:space:]]*"[^"]*"/"token":"[redacted]"/g' \
      -e 's/"accessToken"[[:space:]]*:[[:space:]]*"[^"]*"/"accessToken":"[redacted]"/g' |
    head -c 320
}

has_auth_config() {
  [[ -n "${AIRTRUST_AUTH_TOKEN:-}" || -n "${AIRTRUST_COOKIE:-}" ]]
}

auth_mode_label() {
  if [[ -n "${AIRTRUST_AUTH_TOKEN:-}" ]]; then
    printf 'bearer-token'
  elif [[ -n "${AIRTRUST_COOKIE:-}" ]]; then
    printf 'cookie'
  else
    printf 'none'
  fi
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
      args+=(-H "Authorization: Bearer ${AIRTRUST_AUTH_TOKEN}")
    fi
    if [[ -n "${AIRTRUST_COOKIE:-}" ]]; then
      args+=(-H "Cookie: ${AIRTRUST_COOKIE}")
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
  local endpoint_required="${6:-yes}"
  local payload="${7:-}"

  local url="${AIRTRUST_BASE_URL%/}${path}"
  local tmp
  tmp="$(mktemp)"
  LAST_RESPONSE_FILE="$tmp"

  local -a args=()
  while IFS= read -r line; do
    args+=("$line")
  done < <(build_curl_args "$auth_required")

  args+=(-X "$method")

  if [[ -n "$payload" ]]; then
    args+=(-H "Content-Type: application/json" --data "$payload")
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

  if [[ "$expected_ok" == "yes" ]]; then
    record_pass "$label" "HTTP $http_code"
    return 0
  fi

  if [[ "$endpoint_required" == "optional" && ( "$http_code" == "404" || "$http_code" == "405" || "${http_code:0:1}" == "5" ) ]]; then
    record_skip "$label" "SKIPPED_ENDPOINT_NOT_AVAILABLE" "HTTP $http_code"
    return 0
  fi

  record_fail "$label" "HTTP $http_code expected $expected_csv; body=$(sanitize_body "$tmp")"
  return 1
}

extract_current_empresa_from_auth_empresas() {
  local file="$1"
  node - "$file" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const data = payload && payload.data;
const candidates = Array.isArray(data)
  ? data
  : Array.isArray(data?.empresas)
    ? data.empresas
    : Array.isArray(payload?.empresas)
      ? payload.empresas
      : [];
const current = candidates.find((item) => item && (item.is_current === 1 || item.is_current === true))
  || candidates.find((item) => item && (item.is_primary === 1 || item.is_primary === true))
  || candidates[0]
  || {};
const id = current.id ?? current.empresa_id ?? '';
const codigo = current.codigo ?? current.empresa_codigo ?? '';
process.stdout.write(`${id}\n${codigo}\n`);
NODE
}

validate_expected_empresa() {
  if [[ -z "$AIRTRUST_EXPECTED_EMPRESA_ID" && -z "$AIRTRUST_EXPECTED_EMPRESA_CODIGO" ]]; then
    record_skip "Expected empresa validation" "SKIPPED_ENDPOINT_NOT_AVAILABLE" "no expected empresa configured"
    return 0
  fi

  if [[ -z "$LAST_RESPONSE_FILE" || ! -s "$LAST_RESPONSE_FILE" ]]; then
    record_fail "Expected empresa validation" "auth empresas response unavailable"
    return 1
  fi

  local parsed empresa_id empresa_codigo
  if ! parsed="$(extract_current_empresa_from_auth_empresas "$LAST_RESPONSE_FILE" 2>/dev/null)"; then
    record_fail "Expected empresa validation" "could not parse auth empresas response"
    return 1
  fi

  empresa_id="$(printf '%s\n' "$parsed" | sed -n '1p')"
  empresa_codigo="$(printf '%s\n' "$parsed" | sed -n '2p')"

  if [[ -n "$AIRTRUST_EXPECTED_EMPRESA_ID" && "$empresa_id" != "$AIRTRUST_EXPECTED_EMPRESA_ID" ]]; then
    record_fail "Expected empresa id validation" "got '${empresa_id:-unknown}'"
    return 1
  fi

  if [[ -n "$AIRTRUST_EXPECTED_EMPRESA_CODIGO" && "$empresa_codigo" != "$AIRTRUST_EXPECTED_EMPRESA_CODIGO" ]]; then
    record_fail "Expected empresa codigo validation" "got '${empresa_codigo:-unknown}'"
    return 1
  fi

  record_pass "Expected empresa validation" "empresa matches expected values"
}

guard_writes() {
  if ! is_yes "$AIRTRUST_ALLOW_SMOKE_WRITES"; then
    record_skip "Mutações seguras" "SKIPPED_AUTH_REQUIRED" "AIRTRUST_ALLOW_SMOKE_WRITES != YES"
    return 1
  fi

  if is_production_url; then
    if [[ "$AIRTRUST_CONFIRM_PROD_SMOKE_WRITES" != "$PROD_WRITE_CONFIRM_TEXT" ]]; then
      record_fail "Writes em produção" "missing exact textual confirmation"
      return 1
    fi
  fi

  return 0
}

smoke_assets_policy_read_only() {
  local label="Assets private FIRA probe"
  local tmp
  tmp="$(mktemp)"
  local url="${AIRTRUST_BASE_URL%/}/api/assets/fira/123/test.pdf"

  log "$label [GET /api/assets/fira/123/test.pdf]"
  local http_code content_type
  http_code="$(curl -sS --connect-timeout 15 --max-time 60 -o "$tmp" -w '%{http_code}' "$url" || true)"
  content_type="$(file -b --mime-type "$tmp" 2>/dev/null || true)"

  if [[ "$http_code" != "200" && "$content_type" != "application/pdf" ]]; then
    record_pass "$label" "HTTP $http_code, content-type $content_type"
    rm -f "$tmp"
    return 0
  fi

  record_fail "$label" "unexpected public document response HTTP $http_code, content-type $content_type"
  rm -f "$tmp"
  return 1
}

smoke_public_only() {
  log "Categoria: read-only público"
  run_request "Version" "GET" "/api/version" "200" "no"
  run_request "Health" "GET" "/api/health" "200" "no"
  smoke_assets_policy_read_only
  log "Smoke public-only concluído"
}

smoke_authenticated_read_only() {
  log "Categoria: read-only autenticado"
  run_request "Version" "GET" "/api/version" "200" "no"
  run_request "Health" "GET" "/api/health" "200" "no"
  run_request "Auth me" "GET" "/api/auth/me" "200" "yes"
  run_request "Auth empresas" "GET" "/api/auth/empresas" "200" "yes"
  validate_expected_empresa
  run_request "Dashboard metrics" "GET" "/api/dashboard/metrics" "200" "yes" "optional"
  run_request "FRMS daily fatigue" "GET" "/api/frms/daily-fatigue" "200" "yes" "optional"
  run_request "EVD daily" "GET" "/api/evd?data=$(date +%F)" "200" "yes" "optional"
  run_request "Simuladores sessoes" "GET" "/api/simuladores/sessoes?limit=1" "200" "yes" "optional"
  run_request "Qualificacoes historico" "GET" "/api/qualificacoes/historico?limit=1" "200" "yes" "optional"
  run_request "Funcionarios" "GET" "/api/funcionarios?limit=1" "200" "yes" "optional"
  smoke_rdv_queue_read_only
  smoke_assets_policy_read_only
  log "Read-only autenticado concluído"
}

smoke_rdv_queue_read_only() {
  if ! is_yes "$AIRTRUST_RUN_RDV_QUEUE_SMOKE"; then
    record_skip "RDV queue" "SKIPPED_ENDPOINT_NOT_AVAILABLE" "AIRTRUST_RUN_RDV_QUEUE_SMOKE != YES"
    return 0
  fi

  if [[ "$AIRTRUST_EXPECTED_EMPRESA_ID" != "6" ]]; then
    record_fail "RDV queue" "AIRTRUST_EXPECTED_EMPRESA_ID must be exactly 6 for the governed production closure smoke"
    return 1
  fi

  run_request "RDV queue" "GET" "/api/controle-voos/rdv/fila?limit=1" "200" "yes"
}

smoke_frms_fail_safe() {
  if ! is_yes "$AIRTRUST_RUN_FRMS_FAIL_SAFE"; then
    record_skip "FRMS fail-safe" "SKIPPED_ENDPOINT_NOT_AVAILABLE" "AIRTRUST_RUN_FRMS_FAIL_SAFE != YES"
    return 0
  fi

  if ! guard_writes; then
    record_skip "FRMS fail-safe" "SKIPPED_AUTH_REQUIRED" "writes not authorized"
    return 0
  fi

  log "Categoria: mutation segura (FRMS fail-safe, espera erro de validação)"

  run_request "FRMS fail-safe missing wake_time" "POST" "/api/frms/daily-fatigue" "400,422" "yes" "yes" '{"fit_for_duty":true,"horas_sono_24h":6,"qualidade_sono":4,"kss_score":3,"aceite_termos":true,"aceite_privacidade":true}'
  run_request "FRMS fail-safe missing sleep data" "POST" "/api/frms/daily-fatigue" "400,422" "yes" "yes" '{"wake_time":"07:00","fit_for_duty":true,"qualidade_sono":4,"kss_score":3,"aceite_termos":true,"aceite_privacidade":true}'
  run_request "FRMS fail-safe missing fit_for_duty" "POST" "/api/frms/daily-fatigue" "400,422" "yes" "yes" '{"wake_time":"07:00","horas_sono_24h":6,"qualidade_sono":4,"kss_score":3,"aceite_termos":true,"aceite_privacidade":true}'

  log "FRMS fail-safe concluído"
}

print_summary_and_exit() {
  log "Resumo sanitizado: PASS=$PASS_COUNT FAIL=$FAIL_COUNT SKIPPED=$SKIP_COUNT"
  if [[ "$FAIL_COUNT" -gt 0 ]]; then
    exit 1
  fi
  exit 0
}

main() {
  log "Base URL: $AIRTRUST_BASE_URL"
  log "Writes habilitados: $AIRTRUST_ALLOW_SMOKE_WRITES"
  log "Auth mode: $(auth_mode_label)"

  if is_yes "$AIRTRUST_PUBLIC_ONLY"; then
    smoke_public_only
    print_summary_and_exit
  fi

  if ! has_auth_config; then
    run_request "Version" "GET" "/api/version" "200" "no"
    run_request "Health" "GET" "/api/health" "200" "no"
    smoke_assets_policy_read_only
    record_fail "Authenticated read-only smoke" "AUTHENTICATED_SESSION_UNAVAILABLE"
    print_summary_and_exit
  fi

  smoke_authenticated_read_only
  smoke_frms_fail_safe
  log "Mutações proibidas por padrão: não executadas"
  log "Smoke autenticado operacional concluído"
  print_summary_and_exit
}

main "$@"
