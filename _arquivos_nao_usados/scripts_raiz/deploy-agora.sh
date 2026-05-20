#!/bin/bash

###############################################################################
# Deploy AirTrust direto do Dev Container
# Usa API Token para autenticação automática
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
# VERIFICAÇÕES
###############################################################################

log "========== VERIFICAÇÕES =========="

if [ ! -d "dist/client" ]; then
  error "dist/client não encontrado. Execute: npm run build"
fi

success "✅ Build encontrado"

if ! command -v npx &> /dev/null; then
  error "npx não encontrado"
fi

###############################################################################
# DEPLOY
###############################################################################

log "========== DEPLOY CLOUDFLARE PAGES =========="

log "Você precisa de um API Token da Cloudflare com permissão para Pages"
log ""
info "Opções:"
info "1. Cole seu API Token aqui (se tiver)"
info "2. Use sua máquina local (recomendado)"
log ""

read -p "Cole seu API Token (ou deixe vazio para instruções): " TOKEN

if [ -z "$TOKEN" ]; then
  echo ""
  info "Para fazer deploy com token, você precisa:"
  info "1. Ir em: https://dash.cloudflare.com/profile/api-tokens"
  info "2. Criar um token com permissões para Pages"
  info "3. Colar aqui"
  echo ""
  error "Nenhum token fornecido"
fi

log "Configurando token..."
export CLOUDFLARE_API_TOKEN="$TOKEN"

log "Fazendo deploy..."
npx wrangler pages deploy dist/client \
  --project-name=airtrust \
  --branch=production || error "Deploy falhou"

success "🎉 Deploy completo!"
echo ""
echo "URL: https://airtrust.pages.dev"
echo ""
