#!/bin/bash
set -e

echo "🚨 DEPLOY PARA PRODUÇÃO - AIRTRUST"
echo "Este script vai publicar BACKEND (Workers) e FRONTEND."
echo ""
read -p "Tem CERTEZA que deseja fazer deploy para PRODUÇÃO? (digite 'SIM' em maiúsculas): " CONFIRM

if [ "$CONFIRM" != "SIM" ]; then
  echo "❌ Deploy cancelado."
  exit 1
fi

echo "🔧 Deploy BACKEND PRODUÇÃO..."
cd worker-airtrust
wrangler d1 migrations apply airtrust-db --env=production --remote || true
wrangler deploy --env=production

echo "🌐 Build FRONTEND..."
cd ../react-app
npm install
npm run build

# Se usar Vercel:
if command -v vercel >/dev/null 2>&1; then
  echo "🚀 Deploy FRONTEND (Vercel)..."
  vercel --prod --yes
  echo "✅ Deploy FRONTEND via Vercel finalizado."
else
  echo "⚠️ Vercel CLI não encontrado. Configure deploy do frontend manualmente (Pages ou outro)."
fi

echo "✅ DEPLOY PRODUÇÃO CONCLUÍDO."
