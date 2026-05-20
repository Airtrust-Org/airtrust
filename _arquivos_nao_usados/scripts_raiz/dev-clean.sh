#!/usr/bin/env bash
set -euo pipefail

# ===================================================================
# AirTrust - Limpar Cache de Desenvolvimento
# ===================================================================
# Remove cache do Vite e reinicia dev server
# Use quando frontend não atualizar durante desenvolvimento
# ===================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🧹 AIRTRUST - LIMPEZA DE CACHE (DESENVOLVIMENTO)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Matar processos Vite/dev existentes
echo "🔴 Parando processos de desenvolvimento..."
pkill -f "vite" 2>/dev/null || true
pkill -f "tsx watch" 2>/dev/null || true
pkill -f "wrangler dev" 2>/dev/null || true
sleep 1
echo "   ✓ Processos parados"

# Limpar cache Vite
echo ""
echo "🗑️  Limpando cache Vite..."
if [ -d "node_modules/.vite" ]; then
  rm -rf node_modules/.vite
  echo "   ✓ node_modules/.vite removido"
else
  echo "   ℹ️  node_modules/.vite não existe"
fi

# Limpar dist (se existir)
echo ""
echo "🗑️  Limpando dist/..."
if [ -d "dist" ]; then
  rm -rf dist
  echo "   ✓ dist/ removido"
else
  echo "   ℹ️  dist/ não existe"
fi

# Limpar cache TypeScript
echo ""
echo "🗑️  Limpando cache TypeScript..."
if [ -f "tsconfig.tsbuildinfo" ]; then
  rm -f tsconfig.tsbuildinfo
  echo "   ✓ tsconfig.tsbuildinfo removido"
else
  echo "   ℹ️  tsconfig.tsbuildinfo não existe"
fi

# Limpar .wrangler (cache do worker)
echo ""
echo "🗑️  Limpando cache Wrangler..."
if [ -d ".wrangler" ]; then
  rm -rf .wrangler
  echo "   ✓ .wrangler/ removido"
else
  echo "   ℹ️  .wrangler/ não existe"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ CACHE LIMPO COM SUCESSO!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 Reiniciando dev server..."
echo "   Execute: npm run dev"
echo ""
echo "💡 Dicas extras:"
echo "   - Hard reload no navegador: Cmd+Shift+R (Mac) ou Ctrl+Shift+F5 (Win)"
echo "   - Limpar cache do navegador: DevTools → Application → Clear Storage"
echo "   - Desregistrar SW: DevTools → Application → Service Workers → Unregister"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
