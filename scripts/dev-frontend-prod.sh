#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "🌐 Iniciando frontend local usando dados reais da produção..."
echo "🧹 Limpando processos antigos nas portas de desenvolvimento..."
./scripts/reset-dev-env.sh

echo "🚀 Subindo preview local em http://localhost:3000"
npm run preview
