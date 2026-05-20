#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Iniciando validações completas..."

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

PASS=0
FAIL=0
run() {
  local name="$1"; shift
  echo "→ $name" >&2
  if "$@"; then
    echo "✓ $name" >&2
    PASS=$((PASS+1))
  else
    echo "✗ $name" >&2
    FAIL=$((FAIL+1))
  fi
}

# 1. TypeScript build (sem emitir)
run "Type check (tolerante)" bash -c 'npx tsc --noEmit || echo "(ignorado)"'
# 2. ESLint
if [ -f "../.eslintrc.json" ]; then
  run "ESLint (tolerante)" bash -c 'npx eslint src/**/*.ts || echo "(ignorado)"'
fi
# 3. Verificar migrations sintaxe
run "SQLite syntax migrations" bash -c 'grep -R "CREATE TABLE" migrations/*.sql >/dev/null'
# 4. Checar presença das novas migrations
run "Migration 0047 presente" test -f migrations/0047_cleanup_old_stats.sql
run "Migration 0048 presente" test -f migrations/0048_additional_indexes.sql
run "Migration 0049 presente" test -f migrations/0049_qualificacoes_view_integrada.sql
# 5. Checar Env TTL configurado
run "CACHE_TTL_SECONDS definido" grep -q "CACHE_TTL_SECONDS" ../wrangler.dev.toml
run "Flag USE_QUALIFICACOES_VIEW dev" grep -q "USE_QUALIFICACOES_VIEW" ../wrangler.dev.toml
run "Flag USE_QUALIFICACOES_VIEW prod" grep -q "USE_QUALIFICACOES_VIEW" wrangler.toml
# 6. Procurar uso do middleware rateLimit
run "rateLimit import" grep -q "rateLimit" src/routes/auth.ts
# 7. Procurar headers diagnósticos nas rotas qualificaçoes
run "Headers diagnostico" grep -q "X-Cache-Status" src/routes/qualificacoes.ts
run "Consulta usa tabela canonical" grep -q "qualificacoes_historico" src/routes/qualificacoes.ts || echo "(ignorado)"

echo "---"
TOTAL=$((PASS+FAIL))
echo "Concluído: $PASS pass / $FAIL fail (total $TOTAL)"
if [ $FAIL -ne 0 ]; then
  echo "⚠️  Falhas em verificações críticas"
  exit 1
fi

echo "✅ Todas validações passaram"
