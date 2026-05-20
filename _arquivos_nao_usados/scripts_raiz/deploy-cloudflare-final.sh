#!/bin/bash

###############################################################################
# Deploy Cloudflare Pages - Usando wrangler com credenciais
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

log "========== CLOUDFLARE PAGES DEPLOY =========="

if [ ! -d "dist/client" ]; then
  error "dist/client não encontrado. Execute: npm run build"
fi

success "Build encontrado"

log "Você tem 2 opções:"
log ""
log "1. OPÇÃO A: Criar um novo API Token"
log "   Vá em: https://dash.cloudflare.com/profile/api-tokens"
log "   Crie um token com permissões para Pages"
log "   Cole aqui quando tiver"
log ""
log "2. OPÇÃO B: Usar wrangler com OAuth"
log "   Vai abrir o browser para confirmar"
log ""

read -p "Digite A ou B (padrão: B): " CHOICE
CHOICE=${CHOICE:-B}

if [ "$CHOICE" = "A" ] || [ "$CHOICE" = "a" ]; then
  read -p "Cole seu API Token: " API_TOKEN
  if [ -z "$API_TOKEN" ]; then
    error "Token vazio"
  fi
  export CLOUDFLARE_API_TOKEN="$API_TOKEN"
  log "Token configurado"
else
  log "Usando OAuth via browser..."
  unset CLOUDFLARE_API_TOKEN
  # Desabilitar login interativo já que estamos em dev container
  info "Como estamos em dev container, use na sua máquina:"
  info ""
  info "  npx wrangler pages deploy dist/client --project-name airtrust --branch production"
  info ""
  error "Não é possível fazer OAuth em dev container. Use na sua máquina."
fi

log "Fazendo deploy..."
npx wrangler pages deploy dist/client \
  --project-name airtrust \
  --branch production || error "Deploy falhou"

success "✅ Deploy completo!"
echo ""
echo "🌐 URL: https://airtrust.pages.dev"
echo ""
