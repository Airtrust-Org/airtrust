#!/bin/bash

###############################################################################
# Deploy automático via GitHub Pages (MAIS FÁCIL)
# Não precisa de token - usa GitHub Actions
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

log "========== DEPLOY VIA GITHUB PAGES =========="

log "Step 1: Verificando git..."
if ! command -v git &> /dev/null; then
  error "git não encontrado"
fi

log "Step 2: Build..."
if [ ! -d "dist/client" ]; then
  npm run build || error "Build falhou"
fi
success "Build ok"

log "Step 3: Commitando..."
git add -A
git commit -m "build: deploy automático $(date +%Y-%m-%d_%H:%M:%S)" 2>/dev/null || info "Sem mudanças para commitar"

log "Step 4: Fazendo push..."
git push origin refactor/remove-v2-structure || error "Push falhou"

success "✅ PUSH COMPLETO!"
echo ""
echo "GitHub Actions vai fazer o deploy automaticamente em 1-2 minutos"
echo ""
echo "URL resultante:"
echo "🌐 https://fp-daumas.github.io/airtrust-v1"
echo ""
echo "Acompanhe em:"
echo "🔗 https://github.com/fp-daumas/airtrust-v1/actions"
echo ""
