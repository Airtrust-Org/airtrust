#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="wrangler.dev.toml"
DB_NAME="airtrust-db-dev"

run() {
  echo "> $*"
  eval "$*"
}

echo "🧩 Ensuring local D1 schema + seed (dev)"

# Kill dev processes to release DB locks
run "pkill -f 'wrangler|vite' 2>/dev/null || true"
sleep 1

# Apply migrations in order (idempotent SQL)
apply_sql() {
  local file="$1"
  if [[ -f "$file" ]]; then
    echo "📄 applying: $file"
    npx -y wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --file "$file" >/dev/null
  else
    echo "⚠️  missing file: $file"
  fi
}

apply_sql worker-airtrust/migrations/0000_production_schema.sql || true
apply_sql worker-airtrust/migrations/0026_create_instrutores_simulador.sql || true
apply_sql worker-airtrust/migrations/0027_create_fichas_sessao_manobras.sql || true
apply_sql worker-airtrust/migrations/0031_clean_qualificacoes_tipos.sql || true
apply_sql worker-airtrust/migrations/0032_normalize_qualificacoes_historico.sql || true

# Clone dados da produção se vazio
COUNT_MODELOS=$(npx -y wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --command "SELECT COUNT(*) AS c FROM modelos_sessao WHERE deleted_at IS NULL" | sed -n 's/.*"c":\s*\([0-9][0-9]*\).*/\1/p' | tail -1 || echo 0)
if [[ -z "$COUNT_MODELOS" || "$COUNT_MODELOS" == "" ]]; then COUNT_MODELOS=0; fi

if [[ "$COUNT_MODELOS" -eq 0 ]]; then
  echo "🌱 Clonando modelos da produção..."
  bash scripts/clone-modelos-producao.sh || true
fi

# Show brief status
echo "\n📊 DEV DB status"
npx -y wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" | sed -n 's/.*\"name\": \"\([a-zA-Z0-9_]*\)\".*/\1/p' | paste -sd ', ' - || true
npx -y wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --command "SELECT 'modelos_sessao' as t, COUNT(*) c FROM modelos_sessao WHERE deleted_at IS NULL UNION ALL SELECT 'cadastro_manobras', COUNT(*) FROM cadastro_manobras WHERE deleted_at IS NULL" || true

echo "✅ Local D1 ensured. You can now run: npm run dev:up"
