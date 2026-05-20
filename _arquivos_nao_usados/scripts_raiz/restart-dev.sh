#!/bin/bash
set -e

echo "🔄 Reiniciando servidor de desenvolvimento..."

# Matar todos os processos relacionados
echo "🛑 Parando processos..."
pkill -f "vite --port" 2>/dev/null || true
pkill -f "wrangler dev" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

# Limpar cache do Vite
echo "🧹 Limpando cache..."
rm -rf node_modules/.vite 2>/dev/null || true
rm -rf dist 2>/dev/null || true

# Rebuild
echo "🔨 Rebuilding..."
npm run build

echo "✅ Pronto! Agora execute:"
echo "   npm run dev:all"
echo ""
echo "Ou abra um novo terminal e rode: npm run dev:all"
