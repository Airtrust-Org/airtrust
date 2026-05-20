#!/bin/bash

###############################################################################
# EXECUTE ESTE SCRIPT NA SUA MÁQUINA LOCAL
# 
# Este script faz o deploy do AirTrust para Cloudflare Pages
###############################################################################

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Funções
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }
info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }
highlight() { echo -e "${CYAN}>>> $1${NC}"; }

###############################################################################
# VERIFICAÇÕES
###############################################################################

log "========== VERIFICAÇÕES INICIAIS =========="

# Verificar se está na pasta certa
if [ ! -f "package.json" ]; then
  error "Você não está na pasta raiz do projeto!"
  echo "Execute em: cd ~/airtrust-v1"
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
  error "Node.js não encontrado. Instale em: https://nodejs.org/"
fi

# Verificar npm
if ! command -v npm &> /dev/null; then
  error "npm não encontrado"
fi

log "Node.js: $(node --version)"
log "npm: $(npm --version)"

###############################################################################
# BUILD
###############################################################################

log "========== BUILD =========="

if [ -d "dist" ]; then
  info "dist/ já existe, pulando build..."
else
  highlight "Fazendo build..."
  npm run build || error "Build falhou"
  success "Build completo"
fi

ls -lh dist/client/ | head -10
success "Build está pronto em: dist/client/"

###############################################################################
# LOGIN + DEPLOY
###############################################################################

log "========== CLOUDFLARE PAGES DEPLOY =========="

# Garantir que não há token de API (usar OAuth em vez disso)
unset CLOUDFLARE_API_TOKEN

highlight "Fazendo login na Cloudflare (abre browser)..."
npx wrangler login || error "Login falhou"

success "Login completo!"

log ""
highlight "Fazendo deploy para Cloudflare Pages..."
log ""

# Deploy
npx wrangler pages deploy dist/client \
  --project-name=airtrust \
  --branch=production || error "Deploy falhou"

success "Deploy completo!"

###############################################################################
# RESUMO FINAL
###############################################################################

log ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║                  🎉 DEPLOY COM SUCESSO!                                  ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 STATUS:"
echo "  ✅ Node.js:         $(node --version)"
echo "  ✅ npm:             $(npm --version)"
echo "  ✅ Build:           Completo"
echo "  ✅ Login:           Autenticado"
echo "  ✅ Deploy:          Cloudflare Pages"
echo ""
echo "🌐 ACESSAR:"
echo "  https://airtrust.pages.dev"
echo ""
echo "⏰ Pode levar 1-2 minutos para estar completamente disponível"
echo ""
echo "✨ Sistema está FUNCIONANDO!"
echo ""
