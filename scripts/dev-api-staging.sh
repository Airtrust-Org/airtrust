#!/usr/bin/env bash
set -euo pipefail

echo "�️ Iniciando BACKEND em modo desenvolvimento remoto (Cloudflare Workers) na porta 8787..."
cd "$(dirname "$0")/../worker-airtrust"

echo "🔧 Verificando wrangler..."
command -v wrangler >/dev/null 2>&1 || { echo "❌ Wrangler não encontrado"; exit 1; }

echo "🚀 Rodando: wrangler dev --port 8787 --remote --env production"
wrangler dev --port 8787 --remote --env production
