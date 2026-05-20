#!/bin/bash

###############################################################################
# Configurar GitHub Pages automaticamente
# Isso ativa o deploy automático via GitHub Actions
###############################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }
info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }

log "========== CONFIGURANDO GITHUB PAGES =========="

# Criar workflow GitHub Actions para Pages
log "Criando workflow GitHub Actions..."

mkdir -p .github/workflows

cat > .github/workflows/deploy-pages.yml << 'EOF'
name: Deploy to GitHub Pages

on:
  push:
    branches:
      - refactor/remove-v2-structure
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist/client'

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
EOF

success "Workflow criado em .github/workflows/deploy-pages.yml"

log "Commitando workflow..."
git add .github/workflows/deploy-pages.yml
git commit -m "ci: GitHub Actions workflow para Pages deployment" 2>/dev/null || true

log "Fazendo push..."
git push origin refactor/remove-v2-structure

success "✅ GitHub Pages configurado!"
echo ""
echo "📋 PRÓXIMOS PASSOS:"
echo ""
echo "1. Vá em: https://github.com/fp-daumas/airtrust-v1/settings/pages"
echo ""
echo "2. Em 'Source', selecione:"
echo "   • Deploy from a branch"
echo "   • Branch: gh-pages"
echo "   • Folder: / (root)"
echo ""
echo "3. Clique em 'Save'"
echo ""
echo "4. GitHub Actions vai fazer o build + deploy"
echo ""
echo "5. Em 2-3 minutos seu site estará em:"
echo "   🌐 https://fp-daumas.github.io/airtrust-v1"
echo ""
echo "Monitore em:"
echo "🔗 https://github.com/fp-daumas/airtrust-v1/actions"
echo ""
