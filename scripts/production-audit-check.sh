#!/usr/bin/env bash
# production-audit-check.sh — Auditoria rápida de prontidão para produção.
# Verifica invariantes críticos antes de qualquer deploy.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIL=0

echo "=== Production Audit Check ==="

# 1. JWT_SECRET nunca deve ser um valor fixo conhecível rastreado
if rg -l --glob '*.yml' --glob '*.yaml' --glob '*.toml' \
  -e 'JWT_SECRET\s*=\s*"[^$][^"]{8,}"' \
  "$ROOT_DIR/.github" "$ROOT_DIR/worker-airtrust/wrangler.toml" 2>/dev/null | \
  grep -v '$(openssl' > /dev/null 2>&1; then
  echo "❌ JWT_SECRET hardcodado detectado em arquivo CI/config rastreado"
  FAIL=1
fi

# 2. wrangler.toml não pode ter ENABLE_DEV_AUTH_BYPASS = "true"
if grep -q 'ENABLE_DEV_AUTH_BYPASS\s*=\s*"true"' "$ROOT_DIR/worker-airtrust/wrangler.toml" 2>/dev/null; then
  echo "❌ ENABLE_DEV_AUTH_BYPASS=true encontrado em wrangler.toml rastreado"
  FAIL=1
fi

# 3. dist/ deve existir (build foi feito)
if [[ ! -d "$ROOT_DIR/dist/client" ]]; then
  echo "❌ dist/client/ não existe — execute npm run build antes do deploy"
  FAIL=1
fi

# 4. worker-airtrust/src/index.ts deve existir
if [[ ! -f "$ROOT_DIR/worker-airtrust/src/index.ts" ]]; then
  echo "❌ worker-airtrust/src/index.ts não encontrado"
  FAIL=1
fi

# 5. Nenhum arquivo wrangler.deploy.*.toml dentro do repo
DEPLOY_SNAPS=$(find "$ROOT_DIR/worker-airtrust" -maxdepth 1 -name 'wrangler.deploy.*.toml' 2>/dev/null || true)
if [[ -n "$DEPLOY_SNAPS" ]]; then
  echo "❌ Snapshots de deploy wrangler rastreados encontrados:"
  echo "$DEPLOY_SNAPS"
  FAIL=1
fi

if [[ "$FAIL" -eq 0 ]]; then
  echo "✅ Auditoria de produção OK"
  exit 0
else
  echo ""
  echo "❌ Auditoria de produção falhou. Corrija antes de fazer deploy."
  exit 1
fi
