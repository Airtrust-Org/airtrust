#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Setup Local Development Environment - AirTrust
# ============================================================================
# Este script configura o ambiente local completo:
# 1. Cria arquivo .env.local com VITE_API_URL
# 2. Verifica se o banco de dados está inicializado
# 3. Testa conexão com o backend
# 4. Fornece instruções para iniciar o ambiente
# ============================================================================

COLORS=1
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_title() { echo -e "\n${CYAN}${1}${NC}\n"; }

log_title "=== AirTrust Local Development Setup ==="

# ============================================================================
# STEP 1: Criar arquivo .env.local
# ============================================================================
log_title "STEP 1: Configurando variáveis de ambiente"

ENV_LOCAL=".env.local"
BACKEND_PORT=8787

if [ ! -f "$ENV_LOCAL" ]; then
  log_info "Criando arquivo .env.local..."
  cat > "$ENV_LOCAL" <<EOF
# Local Development Environment Variables
# Este arquivo é usado apenas para desenvolvimento local

# API URL para desenvolvimento local
# Deve apontar para o worker rodando localmente via wrangler
VITE_API_URL=http://localhost:${BACKEND_PORT}/api

# Environment
VITE_ENVIRONMENT=development
VITE_APP_NAME=AirTrust Local
VITE_DEBUG=true
EOF
  log_success "Arquivo .env.local criado com VITE_API_URL=http://localhost:${BACKEND_PORT}/api"
else
  # Verificar se VITE_API_URL está configurado
  if grep -q "VITE_API_URL" "$ENV_LOCAL"; then
    log_info "Arquivo .env.local já existe"
    # Atualizar VITE_API_URL para localhost
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS
      sed -i '' "s|VITE_API_URL=.*|VITE_API_URL=http://localhost:${BACKEND_PORT}/api|" "$ENV_LOCAL"
    else
      # Linux
      sed -i "s|VITE_API_URL=.*|VITE_API_URL=http://localhost:${BACKEND_PORT}/api|" "$ENV_LOCAL"
    fi
    log_success "VITE_API_URL atualizado para http://localhost:${BACKEND_PORT}/api"
  else
    log_info "Adicionando VITE_API_URL ao .env.local..."
    echo "" >> "$ENV_LOCAL"
    echo "VITE_API_URL=http://localhost:${BACKEND_PORT}/api" >> "$ENV_LOCAL"
    log_success "VITE_API_URL adicionado"
  fi
fi

# ============================================================================
# STEP 2: Verificar se o backend está rodando
# ============================================================================
log_title "STEP 2: Verificando backend local"

if curl -s "http://localhost:${BACKEND_PORT}/api/health" > /dev/null 2>&1; then
  log_success "Backend está rodando em http://localhost:${BACKEND_PORT}"
  
  # Testar endpoint de health
  HEALTH_RESPONSE=$(curl -s "http://localhost:${BACKEND_PORT}/api/health" || echo "")
  if [ -n "$HEALTH_RESPONSE" ]; then
    log_success "Health check: OK"
    echo "   Resposta: $HEALTH_RESPONSE"
  fi
else
  log_warn "Backend não está rodando em http://localhost:${BACKEND_PORT}"
  log_info "Para iniciar o backend, execute em outro terminal:"
  echo "   npm run dev:worker"
  echo ""
  log_info "Ou para iniciar tudo automaticamente:"
  echo "   npm run dev:local"
fi

# ============================================================================
# STEP 3: Verificar banco de dados local
# ============================================================================
log_title "STEP 3: Verificando banco de dados local"

DB_FILE=$(find .wrangler/state/v3/d1/miniflare-D1DatabaseObject -name "*.sqlite" 2>/dev/null | head -1)

if [ -n "$DB_FILE" ]; then
  log_success "Banco de dados local encontrado: $DB_FILE"
  
  # Verificar tabelas
  TABLES=$(sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;" 2>/dev/null || echo "")
  
  if [ -n "$TABLES" ]; then
    TABLE_COUNT=$(echo "$TABLES" | wc -l | tr -d ' ')
    log_success "Tabelas encontradas: $TABLE_COUNT"
    
    # Verificar dados em tabelas principais
    if echo "$TABLES" | grep -q "funcionarios"; then
      FUNC_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL;" 2>/dev/null || echo "0")
      log_info "Funcionários: $FUNC_COUNT registros"
    fi
    
    if echo "$TABLES" | grep -q "qualificacoes"; then
      QUAL_COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM qualificacoes WHERE deleted_at IS NULL;" 2>/dev/null || echo "0")
      log_info "Qualificações: $QUAL_COUNT registros"
    fi
  else
    log_warn "Banco de dados encontrado mas sem tabelas"
    log_info "Para inicializar o banco, execute:"
    echo "   npm run db:init:local"
  fi
else
  log_warn "Banco de dados local não encontrado"
  log_info "Para inicializar o banco, execute:"
  echo "   npm run db:init:local"
  echo ""
  log_info "Ou para inicializar e popular com dados de teste:"
  echo "   npm run db:init:local"
  echo "   wrangler d1 execute airtrust-db --local --file migrations/2099_seed_data.sql"
fi

# ============================================================================
# STEP 4: Testar endpoints da API
# ============================================================================
log_title "STEP 4: Testando endpoints da API"

if curl -s "http://localhost:${BACKEND_PORT}/api/health" > /dev/null 2>&1; then
  # Testar endpoint de funcionários
  if curl -s "http://localhost:${BACKEND_PORT}/api/funcionarios" > /dev/null 2>&1; then
    FUNC_RESPONSE=$(curl -s "http://localhost:${BACKEND_PORT}/api/funcionarios" | head -c 100)
    log_success "Endpoint /api/funcionarios: OK"
    if [ -n "$FUNC_RESPONSE" ]; then
      echo "   Resposta: ${FUNC_RESPONSE}..."
    fi
  else
    log_warn "Endpoint /api/funcionarios não respondeu"
  fi
  
  # Testar endpoint de qualificações
  if curl -s "http://localhost:${BACKEND_PORT}/api/qualificacoes" > /dev/null 2>&1; then
    QUAL_RESPONSE=$(curl -s "http://localhost:${BACKEND_PORT}/api/qualificacoes" | head -c 100)
    log_success "Endpoint /api/qualificacoes: OK"
    if [ -n "$QUAL_RESPONSE" ]; then
      echo "   Resposta: ${QUAL_RESPONSE}..."
    fi
  else
    log_warn "Endpoint /api/qualificacoes não respondeu"
  fi
else
  log_warn "Backend não está rodando - não é possível testar endpoints"
fi

# ============================================================================
# STEP 5: Instruções finais
# ============================================================================
log_title "=== Resumo ==="

echo "📋 Configuração:"
echo "   • VITE_API_URL: http://localhost:${BACKEND_PORT}/api"
echo "   • Backend: http://localhost:${BACKEND_PORT}"
echo "   • Frontend: http://localhost:3000 (quando iniciado)"
echo ""

echo "🚀 Para iniciar o ambiente local:"
echo ""
echo "   Opção 1: Iniciar tudo de uma vez"
echo "   $ npm run dev:local"
echo ""
echo "   Opção 2: Iniciar em terminais separados"
echo "   Terminal 1 (Backend):"
echo "   $ npm run dev:worker"
echo ""
echo "   Terminal 2 (Frontend):"
echo "   $ npm run dev"
echo ""

echo "📊 Para verificar o banco de dados:"
echo "   $ npm run db:status"
echo ""

echo "✅ Setup concluído!"
echo ""
echo "📝 Próximos passos:"
echo "   1. Inicie o backend: npm run dev:worker"
echo "   2. Inicie o frontend: npm run dev"
echo "   3. Acesse: http://localhost:3000"
echo ""

