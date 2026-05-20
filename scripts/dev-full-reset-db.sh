#!/usr/bin/env bash
set -euo pipefail

echo "[dev-reset] Parando servidores locais (se ativos)..."
PIDS=$(lsof -ti:3000,8787 || true)
if [ -n "${PIDS}" ]; then
  echo "$PIDS" | xargs -r kill -9 || true
  sleep 2
fi

echo "[dev-reset] Removendo bases D1 locais (.wrangler/state/v3/d1)..."
DB_DIR=".wrangler/state/v3/d1/miniflare-D1DatabaseObject"
if [ -d "$DB_DIR" ]; then
  rm -f "$DB_DIR"/*.sqlite
fi

echo "[dev-reset] Aplicando todas migrations localmente..."
pushd worker-airtrust >/dev/null
wrangler d1 migrations apply airtrust-db --local || {
  echo "[dev-reset] Falha ao aplicar migrations" >&2
  exit 1
}
popd >/dev/null

echo "[dev-reset] Migrations aplicadas. Criando view final (se não incluída)..."
if ! grep -q "0089_view_use_historico_data.sql" worker-airtrust/migrations/0089_view_use_historico_data.sql 2>/dev/null; then
  echo "[dev-reset] Arquivo 0089_view_use_historico_data.sql ausente. Abortando." >&2
  exit 1
fi

echo "[dev-reset] Reiniciando servidor dev (wrangler dev)..."
pushd worker-airtrust >/dev/null
wrangler dev --local &
popd >/dev/null

echo "[dev-reset] Concluído. Use: curl -s http://localhost:8787/api/qualificacoes/historico | jq '.success'"
