#!/bin/bash
set -e

echo "🚀 Deploy PRODUCTION (Vercel)..."
echo ""
read -p "⚠️  Confirma deploy em PRODUÇÃO? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "❌ Deploy cancelado!"
  exit 1
fi

# Build
npm run build

# Deploy production
vercel --prod --yes

echo ""
echo "✅ Deploy produção completo!"
echo "🌐 URL de produção mostrada acima"
