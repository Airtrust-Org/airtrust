#!/usr/bin/env bash
set -euo pipefail

# ===================================================================
# AirTrust - HARD RESET (Desenvolvimento)
# ===================================================================
# Remove TUDO: cache, dist, node_modules
# Reinstala dependências e reinicia
# Use apenas quando dev-clean.sh não resolver
# ===================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  AIRTRUST - HARD RESET COMPLETO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  ATENÇÃO: Isso vai remover node_modules e reinstalar tudo!"
echo "   Tempo estimado: 2-5 minutos"
echo ""
read -p "   Deseja continuar? (y/N): " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Cancelado"
  exit 0
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔴 FASE 1: Parando processos..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

pkill -f "vite" 2>/dev/null || true
pkill -f "tsx" 2>/dev/null || true
pkill -f "wrangler" 2>/dev/null || true
pkill -f "node" 2>/dev/null || true
sleep 2
echo "✓ Processos parados"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🗑️  FASE 2: Removendo tudo..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "   Removendo node_modules..."
rm -rf node_modules
echo "   ✓ node_modules removido"

echo "   Removendo dist..."
rm -rf dist
echo "   ✓ dist removido"

echo "   Removendo cache Vite..."
rm -rf node_modules/.vite
echo "   ✓ Cache Vite removido"

echo "   Removendo .wrangler..."
rm -rf .wrangler
echo "   ✓ .wrangler removido"

echo "   Removendo cache TypeScript..."
rm -f tsconfig.tsbuildinfo
echo "   ✓ Cache TypeScript removido"

echo "   Removendo package-lock.json..."
rm -f package-lock.json
echo "   ✓ package-lock.json removido"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 FASE 3: Reinstalando dependências..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

npm install

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ HARD RESET CONCLUÍDO!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 Pronto para iniciar dev server:"
echo "   npm run dev"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
