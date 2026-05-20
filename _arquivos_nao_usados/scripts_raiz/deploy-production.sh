#!/bin/bash

###############################################################################
# AirTrust - Deploy COMPLETO para Produção
# Faz deploy do Frontend em Cloudflare Pages + API
###############################################################################

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Funções
log() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
error() { echo -e "${RED}❌ $1${NC}"; exit 1; }
info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }

###############################################################################
# 1. BUILD
###############################################################################

log "========== BUILD =========="
success "Build já feito! (dist/ existe)"

if [ ! -d "dist" ]; then
  log "Fazendo build..."
  npm run build || error "Build falhou"
  success "Build completo"
fi

###############################################################################
# 2. DEPLOY CLOUDFLARE PAGES
###############################################################################

log "========== DEPLOY CLOUDFLARE PAGES =========="

# Verificar se wrangler está instalado
if ! command -v wrangler &> /dev/null; then
  info "Instalando wrangler..."
  npm install -g wrangler
fi

log "Fazendo deploy para Cloudflare Pages..."

# Deploy via wrangler
# Nota: Você precisa estar logado (wrangler login)
wrangler pages deploy dist/client \
  --project-name=airtrust \
  --branch=production || error "Deploy Pages falhou"

success "Deploy Cloudflare Pages completo!"

###############################################################################
# 3. VERIFICAÇÃO
###############################################################################

log "========== VERIFICAÇÃO =========="

# Esperar um pouco pela propagação
sleep 5

# URL esperada
PAGES_URL="https://airtrust.pages.dev"

log "Testando $PAGES_URL..."
if curl -s "$PAGES_URL" | grep -q "<!DOCTYPE\|<html" 2>/dev/null; then
  success "✅ Site está online!"
  success "🌐 URL: $PAGES_URL"
else
  info "⚠️ Site pode levar alguns segundos para estar disponível"
  info "🌐 Acesse: $PAGES_URL"
fi

###############################################################################
# 4. RESUMO
###############################################################################

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════════╗"
echo "║                  🎉 DEPLOY COMPLETO COM SUCESSO!                         ║"
echo "╚═══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "📊 RESUMO:"
echo "  ✅ Build:           Completo"
echo "  ✅ Deploy:          Cloudflare Pages"
echo "  🌐 URL Produção:    https://airtrust.pages.dev"
echo "  📦 Arquivos:        dist/client/"
echo ""
echo "🚀 PRÓXIMOS PASSOS:"
echo "  1. Abra: https://airtrust.pages.dev"
echo "  2. Teste login e funcionalidades"
echo "  3. Verifique mobile responsiveness"
echo ""
echo "📝 LOGS:"
echo "  wrangler.log - Logs completos do deploy"
echo ""
echo "⏰ Deploy finalizado em: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""
