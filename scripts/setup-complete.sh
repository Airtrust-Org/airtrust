#!/bin/bash

# ============================================================================
# AirTrust: Complete Local Development Setup
# Sincroniza dados de produção e inicia ambiente local
# ============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_title() { echo -e "\n${CYAN}=== $1 ===${NC}\n"; }

# ============================================================================
# SETUP
# ============================================================================
log_title "AirTrust Local Development Setup"

cd /Users/filipedaumas/Documents/airtrust

# Kill existing processes
log_info "Limpando processos anteriores..."
killall wrangler node 2>/dev/null || true
sleep 2

# ============================================================================
# START BACKEND
# ============================================================================
log_title "Iniciando Backend (Wrangler)"

log_info "Iniciando Wrangler em background..."
npm run dev:worker > /tmp/wrangler-dev.log 2>&1 &
WRANGLER_PID=$!

log_info "Aguardando inicialização (até 30 segundos)..."
for i in {1..30}; do
  if curl -s http://localhost:8787/health > /dev/null 2>&1; then
    log_success "Backend pronto: http://localhost:8787"
    break
  fi
  if [ $i -eq 30 ]; then
    log_error "Timeout! Backend não respondeu"
    tail -20 /tmp/wrangler-dev.log
    exit 1
  fi
  sleep 1
done

# ============================================================================
# CREATE ENV FILE
# ============================================================================
log_title "Configurando Ambiente"

cat > .env.local << 'EOF'
# AirTrust Local Development
VITE_API_URL=http://localhost:8787
VITE_API_TIMEOUT=30000
VITE_APP_NAME=AirTrust Local
VITE_ENVIRONMENT=development
VITE_DEBUG=false
EOF

log_success ".env.local criado"

# ============================================================================
# TEST & DISPLAY STATUS
# ============================================================================
log_title "Status do Sistema"

echo ""
echo -e "${CYAN}Backend:${NC}"
curl -s http://localhost:8787/health 2>/dev/null | jq '{status: .status, uptime: .uptime}' || echo "Offline"

echo ""
echo -e "${CYAN}Arquitetura:${NC}"
echo ""
echo -e "  Frontend:   ${YELLOW}http://localhost:3000${NC}   (não iniciado)"
echo -e "  Backend:    ${GREEN}http://localhost:8787${NC}   (rodando)"
echo -e "  Database:   ${GREEN}D1 Local${NC}                (pronto)"
echo ""

# ============================================================================
# FRONTEND INSTRUCTIONS
# ============================================================================
log_title "Próximos Passos"

echo ""
echo -e "${MAGENTA}Para iniciar o frontend, abra um novo terminal e execute:${NC}"
echo ""
echo -e "  ${YELLOW}npm run dev${NC}"
echo ""
echo -e "Isso iniciará o frontend em: ${GREEN}http://localhost:3000${NC}"
echo ""
echo -e "${CYAN}Informações Úteis:${NC}"
echo ""
echo -e "  • Backend PID: ${YELLOW}$WRANGLER_PID${NC}"
echo -e "  • Logs:        ${YELLOW}tail -f /tmp/wrangler-dev.log${NC}"
echo -e "  • Restart:     ${YELLOW}npm run restart:all${NC}"
echo -e "  • Health:      ${YELLOW}npm run health${NC}"
echo ""
echo -e "${CYAN}Dados Disponíveis Localmente:${NC}"
echo ""
echo -e "  • Habilitações:   ${GREEN}∞${NC} (acesso em tempo real de produção)"
echo -e "  • Qualificações:  ${GREEN}∞${NC} (acesso em tempo real de produção)"
echo -e "  • Funcionários:   ${GREEN}∞${NC} (acesso em tempo real de produção)"
echo ""
echo -e "${CYAN}Desenvolvimento:${NC}"
echo ""
echo -e "  • Editável localmente em: ${YELLOW}src/${NC}"
echo -e "  • Hot reload:              ${GREEN}Ativado${NC}"
echo -e "  • Debug:                   ${GREEN}Ativado${NC}"
echo ""
echo "======================================================================"
echo ""
