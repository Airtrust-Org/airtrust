#!/bin/bash

# Script de limpeza e reinício completo
# Mata processos, limpa cache e reinicia tudo

echo "🧹 Limpando ambiente AirTrust..."

# 1. Matar processos
echo "  → Matando processos wrangler e vite..."
pkill -9 -f wrangler 2>/dev/null
pkill -9 -f vite 2>/dev/null
lsof -ti:8787 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 2

# 2. Limpar cache (opcional - comentado para preservar banco)
# echo "  → Limpando cache wrangler..."
# rm -rf .wrangler/state

echo ""
echo "✅ Ambiente limpo!"
echo ""
echo "Para reiniciar:"
echo "  Backend:  npm run dev:worker"
echo "  Frontend: npm run dev"
