#!/usr/bin/env bash
# ci-demo-data-check.sh — Verifica padrões de dados demo/teste no código-fonte.
# Falha o CI se encontrar seeds ativos, fixtures hardcodadas ou dados de teste no source.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAIL=0

# Pastas e arquivos a ignorar
EXCLUDE_DIRS=(
  "node_modules"
  "dist"
  ".git"
  "scripts/legacy"
  "scripts/sql"
  "scripts/operacionais"
  "worker-airtrust/worker.log"
  "worker-airtrust/migration_output.log"
)

build_rg_excludes() {
  local args=()
  for d in "${EXCLUDE_DIRS[@]}"; do
    args+=("--glob" "!$d/**")
  done
  printf '%s\n' "${args[@]}"
}

RG_EXCLUDES=()
while IFS= read -r line; do RG_EXCLUDES+=("$line"); done < <(build_rg_excludes)

echo "=== CI: Demo Data Prevention Check ==="

# 1. Arquivos CSV de seed ativos (qualquer .csv fora de scripts/)
CSV_IN_SRC=$(find "$ROOT_DIR/src" -name "*.csv" 2>/dev/null | head -5 || true)
if [[ -n "$CSV_IN_SRC" ]]; then
  echo "❌ CSVs de dados encontrados em src/:"
  echo "$CSV_IN_SRC"
  FAIL=1
fi

# 2. E-mails de demo hardcodados no source (exceto config de env, scripts de seed e testes)
DEMO_EMAILS=$(rg -l --glob '*.ts' --glob '*.tsx' --glob '*.js' --glob '*.jsx' \
  --glob '!**/*.test.*' --glob '!**/__tests__/**' --glob '!**/test/**' \
  "${RG_EXCLUDES[@]}" \
  -e 'test@example\.com' \
  -e 'demo@demo\.com' \
  -e 'fake@fake\.com' \
  "$ROOT_DIR/src" 2>/dev/null || true)
if [[ -n "$DEMO_EMAILS" ]]; then
  echo "❌ E-mails demo detectados em:"
  echo "$DEMO_EMAILS"
  FAIL=1
fi

# 3. Flags de bypass de auth em arquivos rastreados
BYPASS_FLAGS=$(rg -l \
  --glob '*.ts' --glob '*.tsx' --glob '*.toml' --glob '*.env' \
  "${RG_EXCLUDES[@]}" \
  -e 'ENABLE_DEV_AUTH_BYPASS\s*=\s*["\047]?true' \
  "$ROOT_DIR/src" "$ROOT_DIR/worker-airtrust/wrangler.toml" 2>/dev/null || true)
if [[ -n "$BYPASS_FLAGS" ]]; then
  echo "❌ ENABLE_DEV_AUTH_BYPASS=true em arquivo rastreado:"
  echo "$BYPASS_FLAGS"
  FAIL=1
fi

# 4. Variáveis de seed ativas no código de produção (não em scripts/)
SEED_CALLS=$(rg -l --glob '*.ts' --glob '*.tsx' \
  "${RG_EXCLUDES[@]}" \
  -e 'seedDemoData\|seed_demo\|insertDemoData\|loadFixtures' \
  "$ROOT_DIR/src" 2>/dev/null || true)
if [[ -n "$SEED_CALLS" ]]; then
  echo "❌ Chamadas de seed/fixture no source:"
  echo "$SEED_CALLS"
  FAIL=1
fi

if [[ "$FAIL" -eq 0 ]]; then
  echo "✅ Nenhum dado demo detectado no source."
  exit 0
else
  echo ""
  echo "❌ Dados demo/teste detectados. Remova antes de fazer merge."
  exit 1
fi
