#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# `git grep -I` already ignores binary payloads. Keep the exclusion surface
# intentionally small so Markdown, SQL, CSV, archived docs and configuration
# are scanned too — those are common places for credentials to leak.
GG_EXCLUDE=(
  ":(exclude)scripts/check-tracked-secrets.sh"
  ":(exclude)package-lock.json"
  ":(exclude)worker-airtrust/package-lock.json"
)

DEV_ONLY_WRANGLER_DEV_BYPASS_FIXTURE='^worker-airtrust/wrangler\.dev\.toml:[0-9]+:ENABLE_DEV_AUTH_BYPASS[[:space:]]*=[[:space:]]*"true"$'
DEV_ONLY_WRANGLER_DEV_JWT_FIXTURE='^worker-airtrust/wrangler\.dev\.toml:[0-9]+:JWT_SECRET[[:space:]]*=[[:space:]]*"airtrust-dev-secret-2025"$'
DYNAMIC_OR_PLACEHOLDER='\$\{|=[[:space:]]*\$[A-Z_][A-Z0-9_]*$|=[[:space:]]*"?\$\(|=[[:space:]]*$|=[[:space:]]*"?(your-|example|placeholder|changeme|dummy|test-only|<)[^[:space:]]*'

check_pattern() {
  local label="$1"
  local pattern="$2"
  local ignore_pattern="${3:-}"

  local raw
  raw="$(git grep -nI -E "$pattern" -- . "${GG_EXCLUDE[@]}" 2>/dev/null || true)"

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
check_pattern "jwt secret rastreado" '^[[:space:]]*JWT_SECRET[[:space:]]*=' "$DEV_ONLY_WRANGLER_DEV_JWT_FIXTURE|$DYNAMIC_OR_PLACEHOLDER" || failed=1
check_pattern "token cloudflare rastreado" '^[[:space:]]*(CLOUDFLARE_API_TOKEN|CLOUDFLARE_TOKEN)[[:space:]]*=' "$DYNAMIC_OR_PLACEHOLDER" || failed=1
check_pattern "secret EdApp rastreado" '^[[:space:]]*(EDAPP_API_TOKEN|EDAPP_WEBHOOK_SECRET)[[:space:]]*=' "$DYNAMIC_OR_PLACEHOLDER" || failed=1
check_pattern "account id Cloudflare rastreado" '^[[:space:]]*(CF_ACCOUNT_ID|CLOUDFLARE_ACCOUNT_ID)[[:space:]]*=' "$DYNAMIC_OR_PLACEHOLDER" || failed=1

# Provider signatures are much less ambiguous than generic KEY=value checks and
# catch credentials even when embedded in Markdown, JSON, YAML, logs or scripts.
check_pattern "GitHub token rastreado" '(ghp_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})' '(EXAMPLE|example|placeholder|dummy)' || failed=1
check_pattern "AWS access key rastreada" '(AKIA|ASIA)[0-9A-Z]{16}' '(EXAMPLE|example|placeholder|dummy)' || failed=1
check_pattern "Google API key rastreada" 'AIza[0-9A-Za-z_-]{35}' '(EXAMPLE|example|placeholder|dummy)' || failed=1
check_pattern "Slack token rastreado" 'xox[baprs]-[0-9A-Za-z-]{20,}' '(EXAMPLE|example|placeholder|dummy)' || failed=1
check_pattern "Stripe secret rastreado" 'sk_(live|test)_[0-9A-Za-z]{20,}' '(EXAMPLE|example|placeholder|dummy)' || failed=1
check_pattern "chave privada rastreada" '-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----' '(EXAMPLE|example|placeholder|fixture)' || failed=1

# Catch long literal assignments for common secret-bearing variable names. The
# narrow variable-name set avoids flagging arbitrary hashes and public IDs.
check_pattern "literal sensível rastreado" '^[[:space:]]*(SENTRY_AUTH_TOKEN|GITHUB_TOKEN|GITLAB_TOKEN|DATABASE_URL|API_SECRET|CLIENT_SECRET|PRIVATE_KEY|PRODUCTION_PASSWORD)[[:space:]]*[:=][[:space:]]*"?[A-Za-z0-9_./+@:=\-]{20,}' "$DYNAMIC_OR_PLACEHOLDER" || failed=1

if [[ "$failed" -ne 0 ]]; then
  echo "[tracked-secrets] Falhou: remova/rotacione segredos rastreados antes do commit."
  exit 1
fi

echo "[tracked-secrets] OK"
