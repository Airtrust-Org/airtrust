#!/bin/bash

# Script para forçar redeploy no Cloudflare Pages
# Cria um commit vazio e faz push, forçando novo deployment que invalida cache

set -e

echo "🔄 Forçando redeploy no Cloudflare Pages..."
echo ""

# Commit vazio para forçar redeploy
git commit --allow-empty -m "chore: force redeploy to clear cache [$(date +%Y-%m-%d-%H:%M:%S)]"

echo ""
echo "📤 Pushing para GitHub..."
git push

echo ""
echo "✅ Push concluído!"
echo ""
echo "⏳ Cloudflare Pages vai detectar o push e fazer redeploy automático"
echo "   O novo deployment vai substituir o cache antigo"
echo ""
echo "🔗 Acompanhe em: https://dash.cloudflare.com/4dca4e5fddc6a351651dd224f456586f/pages/view/airtrust-production"
echo ""
echo "Aguarde 2-3 minutos para o deployment completar"
