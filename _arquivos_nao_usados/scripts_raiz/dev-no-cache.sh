#!/bin/bash

set -e

echo "🔥 DESENVOLVIMENTO LOCAL - SEM CACHE"
echo "===================================="

# Matar processos existentes
echo "🛑 Parando processos anteriores..."
pkill -9 -f "vite|wrangler|node.*3000|node.*8787" 2>/dev/null || true
sleep 2

# Limpar cache do Vite
echo "🗑️  Limpando cache do Vite..."
rm -rf node_modules/.vite
rm -rf .vite

# Limpar dist local
echo "📁 Limpando dist/ local..."
rm -rf dist/

echo ""
echo "✅ Cache limpo!"
echo ""
echo "🚀 Iniciando servidores..."
echo ""
echo "   Backend:  http://localhost:8787"
echo "   Frontend: http://localhost:3000"
echo ""
echo "💡 CTRL+C para parar os servidores"
echo ""

# Iniciar backend em background
cd worker-airtrust
npx wrangler dev --local --port 8787 &
BACKEND_PID=$!
cd ..

# Aguardar backend iniciar
sleep 3

# Iniciar frontend
npm run dev

# Cleanup ao sair
trap "kill $BACKEND_PID 2>/dev/null || true" EXIT
