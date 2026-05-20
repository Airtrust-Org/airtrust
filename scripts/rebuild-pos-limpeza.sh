#!/bin/bash
set -euo pipefail

# Rebuild Nuclear Pós-Limpeza
# Data: 1 de dezembro de 2025

echo "🔥 REBUILD NUCLEAR PÓS-LIMPEZA..."
echo ""

# 1. Parar TODOS servidores
echo "1️⃣  Parando servidores..."
pkill -9 -f "vite" 2>/dev/null || true
pkill -9 -f "npm" 2>/dev/null || true
pkill -9 -f "node" 2>/dev/null || true
sleep 2
echo "   ✅ Servidores parados"

# 2. Deletar TODOS caches
echo ""
echo "2️⃣  Limpando caches..."
rm -rf node_modules
rm -rf dist
rm -rf .vite
rm -rf .cache
rm -rf build
rm -rf ~/.cache/vite 2>/dev/null || true
rm -rf ~/.npm/_cacache 2>/dev/null || true
echo "   ✅ Caches deletados"

# 3. Limpar npm
echo ""
echo "3️⃣  Limpando npm cache..."
npm cache clean --force
npm cache verify
echo "   ✅ npm cache limpo"

# 4. Reinstalar dependências
echo ""
echo "4️⃣  Reinstalando node_modules..."
npm install
echo "   ✅ Dependências instaladas"

# 5. Build completo
echo ""
echo "5️⃣  Building..."
npm run build

# 6. Verificar bundle
echo ""
echo "6️⃣  Verificando bundle gerado..."
ls -lh dist/client/assets/ | grep -i "simulador" | head -10 || echo "   (Nenhum arquivo específico de simulador)"

echo ""
echo "✅ Rebuild completo!"
echo "📝 Próximo passo: Verificar imports quebrados"
