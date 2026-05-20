#!/usr/bin/env bash
set -euo pipefail

echo "🌐 Iniciando FRONTEND (Vite) em http://localhost:3000 ..."
cd "$(dirname "$0")/.."

if [ -f package.json ]; then
	echo "🔧 Verificando dependências (skip se já instalado)..."
	npm run -s >/dev/null 2>&1 || npm install
fi

echo "🚀 Rodando: npm run dev:web"
npm run dev:web
