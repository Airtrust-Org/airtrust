#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "🧹 Limpando ambiente travado (portas comuns)..."
./scripts/reset-dev-env.sh

echo "🌐 Subindo ambiente web local com dados reais da produção..."
npm run preview
