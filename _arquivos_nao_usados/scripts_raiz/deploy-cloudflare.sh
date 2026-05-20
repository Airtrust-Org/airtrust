#!/bin/bash

###############################################################################
# Deploy Cloudflare Pages - Usando credenciais diretas
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

# Gerar API token via curl + credenciais
log "Obtendo API Token com suas credenciais..."

EMAIL="filipe.daumas@icloud.com"
PASSWORD="Davi@1979cla"

# Fazer login e obter token
TOKEN_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/user/tokens/create" \
  -H "X-Auth-Email: $EMAIL" \
  -H "X-Auth-Key: $PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{
    "name":"wrangler-deploy-'$(date +%s)'",
    "ttl":3600,
    "permissions":["#zone:read","#account:read","#user:read"],
    "resources":{"com.cloudflare.api":"*"}
  }' 2>/dev/null)

# Extrair token
TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  info "Método 1 (API direto) falhou. Tentando método alternativo..."
  
  log ""
  log "Tentando deploy com npx wrangler pages..."
  log ""
  
  # Tentar deploy direto (vai pedir autenticação)
  npx wrangler pages deploy dist/client \
    --project-name airtrust \
    --branch production || error "Deploy falhou"
else
  log "Token obtido com sucesso!"
  
  export CLOUDFLARE_API_TOKEN="$TOKEN"
  
  log "Fazendo deploy para Cloudflare Pages..."
  npx wrangler pages deploy dist/client \
    --project-name airtrust \
    --branch production || error "Deploy falhou"
fi

success "✅ Deploy completo!"
echo ""
echo "URL: https://airtrust.pages.dev"
echo ""
