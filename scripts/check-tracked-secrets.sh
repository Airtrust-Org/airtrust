#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Pathspecs excluídos do git grep (arquivos que tipicamente têm falsos positivos ou são binários)
GG_EXCLUDE=(
  ":(exclude)*.md"
  ":(exclude)*.sql"
  ":(exclude)*.sqlite"
  ":(exclude)*.pdf"
  ":(exclude)*.png"
  ":(exclude)*.jpg"
  ":(exclude)*.jpeg"
  ":(exclude)*.gif"
  ":(exclude)*.webp"
  ":(exclude)*.woff"
  ":(exclude)*.woff2"
  ":(exclude)*.bundle"
  ":(exclude)*.zip"
  ":(exclude)*.csv"
  ":(exclude)*.tsbuildinfo"
  ":(exclude).env.example"
  ":(exclude).env.development.example"
  ":(exclude)worker-airtrust/.env.example"
  ":(exclude)worker-airtrust/.dev.vars.example"
  ":(exclude)worker-airtrust/worker.log"
  ":(exclude)worker-airtrust/migration_output.log"
  ":(exclude).devcontainer.disabled/**"
  ":(exclude).tmp-*/**"
  ":(exclude).tmp-deploy-*/**"
  ":(exclude).claude/**"
  ":(exclude)scripts/legacy/**"
  ":(exclude)scripts/check-tracked-secrets.sh"
)

# Allowlist estreita para fixtures dev-only/local rastreados no wrangler.dev.toml.
# Mantém o scanner ativo para quaisquer outras flags ou segredos no mesmo arquivo.
DEV_ONLY_WRANGLER_DEV_BYPASS_FIXTURE='^worker-airtrust/wrangler\.dev\.toml:[0-9]+:ENABLE_DEV_AUTH_BYPASS[[:space:]]*=[[:space:]]*"true"$'
DEV_ONLY_WRANGLER_DEV_JWT_FIXTURE='^worker-airtrust/wrangler\.dev\.toml:[0-9]+:JWT_SECRET[[:space:]]*=[[:space:]]*"airtrust-dev-secret-2025"$'
JWT_SECRET_DYNAMIC_IGNORE_PATTERN='\$\{|=[[:space:]]*\$[A-Z_][A-Z0-9_]*$|=[[:space:]]*"?\$\(|=[[:space:]]*$|=[[:space:]]*"?your-|=[[:space:]]*"?dev-secret-key-change-in-production'

check_pattern() {
  local label="$1"
  local pattern="$2"
  local ignore_pattern="${3:-}"

  local raw
  raw="$(git grep -nE "$pattern" -- "${GG_EXCLUDE[@]}" 2>/dev/null || true)"

  local matches="$raw"
  if [[ -n "$ignore_pattern" && -n "$raw" ]]; then
    matches="$(printf '%s\n' "$raw" | grep -vE "$ignore_pattern" || true)"
  fi

  if [[ -n "$matches" ]]; then
    echo "[tracked-secrets] $label"
    printf '%s\n' "$matches"
    return 1
  fi
  return 0
}

failed=0

check_pattern "senha default rastreada" '^(VITE_DEFAULT_LOGIN_PASSWORD|TEST_PASSWORD)=[^[:space:]]+' '=[[:space:]]*$' || failed=1
check_pattern "bypass de auth ativo" '^[[:space:]]*ENABLE_DEV_AUTH_BYPASS[[:space:]]*=[[:space:]]*"?true"?' "$DEV_ONLY_WRANGLER_DEV_BYPASS_FIXTURE" || failed=1
check_pattern "jwt secret rastreado" '^[[:space:]]*JWT_SECRET[[:space:]]*=' "$DEV_ONLY_WRANGLER_DEV_JWT_FIXTURE|$JWT_SECRET_DYNAMIC_IGNORE_PATTERN" || failed=1
check_pattern "token cloudflare rastreado" '^[[:space:]]*(CLOUDFLARE_API_TOKEN|CLOUDFLARE_TOKEN)=' '\$\{|=[[:space:]]*$|=[[:space:]]*npx\b|=your-' || failed=1
check_pattern "secret EdApp rastreado" '^[[:space:]]*(EDAPP_API_TOKEN|EDAPP_WEBHOOK_SECRET)=' '\$\{|=[[:space:]]*$|=your-' || failed=1
check_pattern "account id rastreado" '^[[:space:]]*CF_ACCOUNT_ID=' '\$\{|=[[:space:]]*$|=your-' || failed=1

if [[ "$failed" -ne 0 ]]; then
  echo "[tracked-secrets] Falhou: remova segredos/flags rastreados antes do commit."
  exit 1
fi

echo "[tracked-secrets] OK"
