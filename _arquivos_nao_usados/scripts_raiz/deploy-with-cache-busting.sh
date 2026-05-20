#!/usr/bin/env bash
set -euo pipefail

# ===================================================================
# Script de Deploy Final com Cache-Busting
# ===================================================================
# Este script deve ser usado para TODOS os deploys de produção
# Garante que usuários sempre recebam a versão mais recente
# ===================================================================

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 AIRTRUST - DEPLOY COM CACHE-BUSTING COMPLETO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Validação pré-deploy
echo "✅ 1/6 Validando ambiente..."
if [ ! -f "package.json" ]; then
  echo "❌ ERRO: Execute na raiz do projeto"
  exit 1
fi

# Build
echo ""
echo "🔨 2/6 Building aplicação..."
npm run build || { echo "❌ Build falhou"; exit 1; }

# Type check
echo ""
echo "🧪 3/6 Type checking..."
npx tsc --noEmit || { echo "⚠️  Type errors encontrados (não bloqueante)"; }

# Validação do build
echo ""
echo "🔍 4/6 Validando build..."
if [ ! -f "dist/client/index.html" ]; then
  echo "❌ ERRO: index.html não gerado"
  exit 1
fi

if [ ! -f "dist/client/manifest.json" ]; then
  echo "⚠️  AVISO: manifest.json não gerado (esperado em algumas configs)"
else
  echo "✅ manifest.json gerado"
  ASSETS_COUNT=$(cat dist/client/manifest.json | grep -o '"file":' | wc -l | tr -d ' ')
  echo "   $ASSETS_COUNT assets no manifest"
fi

# Git commit (se houver mudanças)
echo ""
echo "📦 5/6 Commitando mudanças..."
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  COMMIT_MSG="${1:-deploy: auto build + cache-busting $(date +%Y-%m-%d\ %H:%M)}"
  git commit -m "$COMMIT_MSG"
  echo "✅ Commit: $COMMIT_MSG"
else
  echo "ℹ️  Nenhuma mudança para commitar"
fi

# Deploy
echo ""
echo "🚀 6/6 Deploying..."
if [ -d "worker-airtrust" ]; then
  echo "   Deploying worker..."
  cd worker-airtrust
  wrangler deploy --env production || { echo "❌ Deploy worker falhou"; exit 1; }
  cd ..
fi

# Push git
echo "   Pushing to remote..."
git push || { echo "⚠️  Git push falhou (não bloqueante)"; }

# Cloudflare purge (se configurado)
echo ""
echo "🔄 Purgando cache Cloudflare..."
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f "scripts/purge-cloudflare-cache.sh" ]; then
  chmod +x scripts/purge-cloudflare-cache.sh
  ./scripts/purge-cloudflare-cache.sh || echo "⚠️  Purge falhou (não bloqueante)"
else
  echo "ℹ️  Cloudflare purge não configurado"
  echo "   Configure CLOUDFLARE_API_TOKEN e CLOUDFLARE_ZONE_ID para habilitar"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ DEPLOY CONCLUÍDO COM SUCESSO!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Próximos passos:"
echo ""
echo "1. ⏱️  Aguarde 1-2 minutos para propagação"
echo "2. 🌐 Acesse: https://fp-daumas.github.io/airtrust-v1"
echo "3. 🔄 Force reload: Cmd+Shift+R (Mac) ou Ctrl+Shift+F5 (Win)"
echo "4. 🔔 Service Worker notificará usuários sobre update"
echo ""
echo "🐛 Troubleshooting:"
echo "   - Frontend não atualiza? Execute: ./scripts/purge-cloudflare-cache.sh --all"
echo "   - Validar deploy: ./scripts/validate-deploy.sh https://fp-daumas.github.io/airtrust-v1"
echo "   - Ver logs: cd worker-airtrust && wrangler tail --env production"
echo ""
echo "📚 Documentação completa: VITE-CACHE-BUSTING-SOLUCAO-DEFINITIVA.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
