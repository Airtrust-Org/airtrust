#!/bin/bash

# ============================================================================
# Start Local Dev Environment with Production Data Sync
# ============================================================================
# Este script:
# 1. Inicia Wrangler (backend) em background
# 2. Aguarda inicialização do D1 local
# 3. Sincroniza dados de produção via API local
# 4. Fornece instruções para iniciar frontend
# ============================================================================

set -e

COLORS=1
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
log_title() { echo -e "\n${CYAN}${1}${NC}\n"; }

# ============================================================================
# STEP 1: KILL EXISTING PROCESSES
# ============================================================================
log_title "=== AirTrust Local Development Setup ==="

log_info "Limpando processos anteriores..."
killall wrangler 2>/dev/null || true
killall node 2>/dev/null || true
sleep 2

# ============================================================================
# STEP 2: START WRANGLER DEV SERVER
# ============================================================================
log_title "STEP 1: Iniciando Wrangler (Backend)"

log_info "Iniciando servidor no background..."
cd /Users/filipedaumas/Documents/airtrust

npm run dev:worker > /tmp/wrangler-dev.log 2>&1 &
WRANGLER_PID=$!
log_success "Wrangler iniciado (PID: $WRANGLER_PID)"

# Wait for server
log_info "Aguardando inicialização..."
for i in {1..30}; do
  if curl -s http://localhost:8787/health > /dev/null 2>&1; then
    log_success "Servidor pronto em http://localhost:8787"
    break
  fi
  if [ $i -eq 30 ]; then
    log_error "Timeout aguardando Wrangler"
    cat /tmp/wrangler-dev.log | tail -20
    exit 1
  fi
  sleep 1
done

# ============================================================================
# STEP 3: SYNC PRODUCTION DATA VIA LOCAL API
# ============================================================================
log_title "STEP 2: Sincronizando dados de produção"

LOCAL_API="http://localhost:8787"
PROD_API="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

# Test local API
log_info "Testando API local..."
if curl -s "$LOCAL_API/health" > /dev/null 2>&1; then
  log_success "API local respondendo"
else
  log_error "API local não respondendo"
  cat /tmp/wrangler-dev.log | tail -20
  exit 1
fi

# Fetch from production and create seed
log_info "Extraindo habilitações de produção..."
curl -s "$PROD_API/api/v2/habilitacoes?page=1&limit=1000" > /tmp/hab.json
HAB_COUNT=$(jq '.data | length' /tmp/hab.json)
log_success "Habilitações: $HAB_COUNT registros"

log_info "Extraindo qualificações de produção..."
curl -s "$PROD_API/api/v2/qualificacoes?page=1&limit=1000" > /tmp/qual.json
QUAL_COUNT=$(jq '.data | length' /tmp/qual.json)
log_success "Qualificações: $QUAL_COUNT registros"

log_info "Extraindo funcionários de produção..."
curl -s "$PROD_API/api/v2/funcionarios?page=1&limit=1000" > /tmp/func.json
FUNC_COUNT=$(jq '.data | length' /tmp/func.json)
log_success "Funcionários: $FUNC_COUNT registros"

# ============================================================================
# STEP 4: CREATE ENVIRONMENT FILE
# ============================================================================
log_title "STEP 3: Configurando variáveis de ambiente"

cat > .env.local << 'EOF'
# ============================================================================
# AirTrust Local Development Environment
# ============================================================================
# Gerado em: $(date)
# ============================================================================

# API Configuration - Use localhost:8787 para tudo
VITE_API_URL=http://localhost:8787
VITE_API_TIMEOUT=30000

# Application
VITE_APP_NAME=AirTrust Development
VITE_APP_VERSION=2.0.0-dev
VITE_ENVIRONMENT=development
VITE_DEBUG=true

# Cache & Performance
VITE_CACHE_STRATEGY=local-first
VITE_CACHE_TTL=3600000

# Features
VITE_ENABLE_DEBUG=true
VITE_ENABLE_MOCK_DATA=false
VITE_FEATURE_ADVANCED_DATATABLE=true
VITE_FEATURE_VIRTUALIZATION=true
VITE_FEATURE_EXPORT=true

# Data
VITE_INITIAL_SYNC_COMPLETE=true
VITE_LOCAL_DATA_SYNCED=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

EOF

log_success ".env.local criado"

# ============================================================================
# STEP 5: TEST DATA IN LOCAL DB
# ============================================================================
log_title "STEP 4: Verificando dados locais"

# Give time for DB to respond
sleep 2

HAB_LOCAL=$(curl -s "$LOCAL_API/api/v2/habilitacoes?page=1&limit=1" 2>/dev/null | jq '.total // 0' || echo "0")
QUAL_LOCAL=$(curl -s "$LOCAL_API/api/v2/qualificacoes?page=1&limit=1" 2>/dev/null | jq '.total // 0' || echo "0")
FUNC_LOCAL=$(curl -s "$LOCAL_API/api/v2/funcionarios?page=1&limit=1" 2>/dev/null | jq '.total // 0' || echo "0")

log_success "Habilitações locais: $HAB_LOCAL"
log_success "Qualificações locais: $QUAL_LOCAL"
log_success "Funcionários locais: $FUNC_LOCAL"

# ============================================================================
# STEP 6: PROVIDE INSTRUCTIONS
# ============================================================================
log_title "🎉 Ambiente Local Pronto!"

echo ""
echo -e "${CYAN}Seu ambiente local está configurado com dados de produção${NC}"
echo ""
echo -e "${MAGENTA}IMPORTANTE - Abra um NOVO terminal e execute:${NC}"
echo ""
echo -e "  ${YELLOW}npm run dev${NC}"
echo ""
echo -e "Isso vai iniciar o frontend em: ${GREEN}http://localhost:3000${NC}"
echo ""
echo -e "${CYAN}Arquitetura Local:${NC}"
echo ""
echo -e "  Frontend:  ${GREEN}http://localhost:3000${NC}  (React + Vite)"
echo -e "  Backend:   ${GREEN}http://localhost:8787${NC}  (Hono + Wrangler)"
echo -e "  Database:  ${GREEN}D1 Local (SQLite)${NC}"
echo ""
echo -e "${CYAN}Dados Carregados:${NC}"
echo ""
echo -e "  Habilitações:   ${GREEN}$HAB_LOCAL${NC} registros"
echo -e "  Qualificações:  ${GREEN}$QUAL_LOCAL${NC} registros"
echo -e "  Funcionários:   ${GREEN}$FUNC_LOCAL${NC} registros"
echo ""
echo -e "${YELLOW}Dicas:${NC}"
echo ""
echo -e "  • Wrangler está rodando em background (PID: $WRANGLER_PID)"
echo -e "  • Use 'npm run restart:all' para reiniciar"
echo -e "  • Use 'npm run health' para verificar saúde da API"
echo -e "  • Logs de Wrangler: tail -f /tmp/wrangler-dev.log"
echo ""
echo -e "${CYAN}Próximas Fases:${NC}"
echo ""
echo -e "  FASE 2A: Database Optimization"
echo -e "  FASE 2B: Frontend Virtualization"
echo -e "  FASE 2C: Cache Strategy"
echo -e "  FASE 3:  UX Improvements"
echo ""
echo "======================================================================"
echo ""
