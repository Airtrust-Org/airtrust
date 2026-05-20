#!/bin/bash
set -e

echo "🚀 Deploy STAGING (Vercel)..."
echo ""

# Build
npm run build

# Deploy
vercel --yes

echo ""
echo "✅ Deploy staging completo!"
echo "🌐 A URL está mostrada acima"
