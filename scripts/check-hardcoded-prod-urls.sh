#!/usr/bin/env bash
set -euo pipefail

# Guardrail: block accidental reintroduction of hardcoded production domains
# in runtime source files. Some files are explicitly allowlisted because they
# are canonical configuration, API docs, or controlled fallback defaults.

PATTERN='airtrust-api-production\.airtrust\.workers\.dev|https://airtrust\.online'

ALLOWLIST_REGEX='src/react-app/config/api.ts|worker-airtrust/src/config/allowed-origins.ts|worker-airtrust/src/utils/openapi.ts|worker-airtrust/src/routes/admin-migration.ts|worker-airtrust/src/services/html-to-pdf.ts|worker-airtrust/src/services/pdf-generator.ts'

SEARCH_ROOTS=(
  'src/react-app'
  'worker-airtrust/src'
)

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

for root in "${SEARCH_ROOTS[@]}"; do
  if [[ -d "$root" ]]; then
    grep -RInE "$PATTERN" "$root" \
      --include='*.ts' \
      --include='*.tsx' \
      --exclude-dir='__tests__' \
      --exclude-dir='test' \
      --exclude-dir='migrations' \
      >> "$TMP_FILE" || true
  fi
done

FILTERED="$(grep -Ev "$ALLOWLIST_REGEX" "$TMP_FILE" || true)"

if [[ -n "$FILTERED" ]]; then
  echo '[hardcoded-prod-urls] FAIL: encontrados domínios hardcoded fora da allowlist:'
  echo "$FILTERED"
  exit 1
fi

echo '[hardcoded-prod-urls] OK'
