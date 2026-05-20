#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-https://airtrust-api-production.airtrust.workers.dev}"

assets_url="$API_BASE_URL/api/assets/logos/__auth_smoke__.png"
status_assets=$(curl -s -o /dev/null -w "%{http_code}" "$assets_url")

if [[ "$status_assets" == "401" || "$status_assets" == "403" ]]; then
  echo "❌ Smoke falhou: /api/assets está protegido por auth (HTTP $status_assets)"
  echo "   URL: $assets_url"
  exit 1
fi

if [[ "$status_assets" == "000" ]]; then
  echo "❌ Smoke falhou: sem resposta de rede para /api/assets"
  echo "   URL: $assets_url"
  exit 1
fi

protected_url="$API_BASE_URL/api/auth/empresas"
status_protected=$(curl -s -o /dev/null -w "%{http_code}" "$protected_url")

if [[ "$status_protected" == "200" ]]; then
  echo "❌ Smoke falhou: endpoint protegido respondeu 200 sem token"
  echo "   URL: $protected_url"
  exit 1
fi

echo "✅ Smoke assets/auth OK (assets=$status_assets protected=$status_protected)"
