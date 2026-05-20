#!/bin/bash

# ============================================================================
# Setup Ambiente Local Development - AirTrust
# ============================================================================
# Configura:
# 1. Variáveis de ambiente
# 2. Database local (D1)
# 3. Copia dados de produção
# 4. Inicia servidor de desenvolvimento
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
# VERIFY ENVIRONMENT
# ============================================================================
log_title "=== AirTrust Local Development Setup ==="

if ! command -v node &> /dev/null; then
  log_error "Node.js não está instalado"
  exit 1
fi

if ! command -v sqlite3 &> /dev/null; then
  log_error "SQLite3 não está instalado"
  exit 1
fi

if ! command -v curl &> /dev/null; then
  log_error "cURL não está instalado"
  exit 1
fi

log_success "Dependências verificadas"

# ============================================================================
# STEP 1: INITIALIZE D1 DATABASE
# ============================================================================
log_title "STEP 1: Inicializando banco de dados local (D1)"

# Kill any existing wrangler process
killall wrangler 2>/dev/null || true
sleep 1

log_info "Iniciando servidor Wrangler em background..."
npm run dev:worker > /tmp/wrangler.log 2>&1 &
WRANGLER_PID=$!
log_success "Wrangler iniciado (PID: $WRANGLER_PID)"

# Wait for wrangler to start
log_info "Aguardando servidor ficar pronto..."
for i in {1..30}; do
  if curl -s http://localhost:8787/health > /dev/null 2>&1; then
    log_success "Servidor pronto!"
    break
  fi
  if [ $i -eq 30 ]; then
    log_error "Timeout aguardando servidor"
    kill $WRANGLER_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

# Find local D1 database
DB_PATH=$(find .wrangler/state/v3/d1 -name "*.sqlite" -type f | head -1)
if [ -z "$DB_PATH" ]; then
  log_error "Banco D1 local não encontrado"
  kill $WRANGLER_PID 2>/dev/null || true
  exit 1
fi

log_success "Banco local encontrado: $DB_PATH"

# ============================================================================
# STEP 2: FETCH PRODUCTION DATA
# ============================================================================
log_title "STEP 2: Copiando dados de produção"

PROD_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

log_info "Extraindo habilitações..."
if curl -s "$PROD_URL/api/v2/habilitacoes?page=1&limit=1000" -o "$TEMP_DIR/hab.json" 2>/dev/null; then
  HAB_COUNT=$(jq '.data | length' "$TEMP_DIR/hab.json" 2>/dev/null || echo "0")
  log_success "Habilitações: $HAB_COUNT registros"
else
  log_warn "Erro ao extrair habilitações"
fi

log_info "Extraindo qualificações..."
if curl -s "$PROD_URL/api/v2/qualificacoes?page=1&limit=1000" -o "$TEMP_DIR/qual.json" 2>/dev/null; then
  QUAL_COUNT=$(jq '.data | length' "$TEMP_DIR/qual.json" 2>/dev/null || echo "0")
  log_success "Qualificações: $QUAL_COUNT registros"
else
  log_warn "Erro ao extrair qualificações"
fi

log_info "Extraindo funcionários..."
if curl -s "$PROD_URL/api/v2/funcionarios?page=1&limit=1000" -o "$TEMP_DIR/func.json" 2>/dev/null; then
  FUNC_COUNT=$(jq '.data | length' "$TEMP_DIR/func.json" 2>/dev/null || echo "0")
  log_success "Funcionários: $FUNC_COUNT registros"
else
  log_warn "Erro ao extrair funcionários"
fi

# ============================================================================
# STEP 3: IMPORT DATA
# ============================================================================
log_title "STEP 3: Importando dados no banco local"

# Helper function to escape SQL strings
escape_sql() {
  echo "$1" | sed "s/'/''/g"
}

# Process habilitações
if [ -f "$TEMP_DIR/hab.json" ]; then
  while IFS= read -r line; do
    id=$(echo "$line" | jq -r '.id')
    nome=$(echo "$line" | jq -r '.nome // ""')
    descricao=$(echo "$line" | jq -r '.descricao // ""')
    ativo=$(echo "$line" | jq -r '.ativo // 1')
    created_at=$(echo "$line" | jq -r '.created_at // "2025-01-01T00:00:00Z"')
    
    nome=$(escape_sql "$nome")
    descricao=$(escape_sql "$descricao")
    
    sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO habilitacoes (id, nome, descricao, ativo, created_at, updated_at) VALUES ($id, '$nome', '$descricao', $ativo, '$created_at', CURRENT_TIMESTAMP);" 2>/dev/null
  done < <(jq -c '.data[]' "$TEMP_DIR/hab.json")
  log_success "Habilitações importadas"
fi

# Process qualificações
if [ -f "$TEMP_DIR/qual.json" ]; then
  while IFS= read -r line; do
    id=$(echo "$line" | jq -r '.id')
    hab_id=$(echo "$line" | jq -r '.habilitacao_id')
    nome=$(echo "$line" | jq -r '.nome // ""')
    descricao=$(echo "$line" | jq -r '.descricao // ""')
    validade=$(echo "$line" | jq -r '.validade_meses // 12')
    ativo=$(echo "$line" | jq -r '.ativo // 1')
    created_at=$(echo "$line" | jq -r '.created_at // "2025-01-01T00:00:00Z"')
    
    nome=$(escape_sql "$nome")
    descricao=$(escape_sql "$descricao")
    
    sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO qualificacoes (id, habilitacao_id, nome, descricao, validade_meses, ativo, created_at, updated_at) VALUES ($id, $hab_id, '$nome', '$descricao', $validade, $ativo, '$created_at', CURRENT_TIMESTAMP);" 2>/dev/null
  done < <(jq -c '.data[]' "$TEMP_DIR/qual.json")
  log_success "Qualificações importadas"
fi

# Process funcionários
if [ -f "$TEMP_DIR/func.json" ]; then
  while IFS= read -r line; do
    id=$(echo "$line" | jq -r '.id')
    nome=$(echo "$line" | jq -r '.nome // ""')
    cpf=$(echo "$line" | jq -r '.cpf // ""')
    email=$(echo "$line" | jq -r '.email // ""')
    ativo=$(echo "$line" | jq -r '.ativo // 1')
    created_at=$(echo "$line" | jq -r '.created_at // "2025-01-01T00:00:00Z"')
    
    nome=$(escape_sql "$nome")
    cpf=$(escape_sql "$cpf")
    email=$(escape_sql "$email")
    
    sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO funcionarios (id, nome, cpf, email, ativo, created_at, updated_at) VALUES ($id, '$nome', '$cpf', '$email', $ativo, '$created_at', CURRENT_TIMESTAMP);" 2>/dev/null
  done < <(jq -c '.data[]' "$TEMP_DIR/func.json")
  log_success "Funcionários importados"
fi

# ============================================================================
# STEP 4: VERIFY IMPORT
# ============================================================================
log_title "STEP 4: Verificando importação"

HAB_LOCAL=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM habilitacoes WHERE deleted_at IS NULL;" 2>/dev/null || echo "0")
QUAL_LOCAL=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM qualificacoes WHERE deleted_at IS NULL;" 2>/dev/null || echo "0")
FUNC_LOCAL=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL;" 2>/dev/null || echo "0")

log_success "Local: $HAB_LOCAL habilitações, $QUAL_LOCAL qualificações, $FUNC_LOCAL funcionários"

# ============================================================================
# STEP 5: CREATE ENV FILES
# ============================================================================
log_title "STEP 5: Configurando variáveis de ambiente"

# .env.local for frontend
cat > .env.local << 'EOF'
# ============================================================================
# AirTrust Local Development Environment
# ============================================================================

# API Configuration
VITE_API_URL=http://localhost:8787
VITE_API_TIMEOUT=30000

# Application
VITE_APP_NAME=AirTrust Local
VITE_APP_VERSION=1.0.0-dev
VITE_ENVIRONMENT=development

# Features
VITE_ENABLE_DEBUG=true
VITE_ENABLE_MOCK_DATA=false

# Cache
VITE_CACHE_STRATEGY=local-first
VITE_CACHE_TTL=3600000

# Feature Flags
VITE_FEATURE_ADVANCED_DATATABLE=true
VITE_FEATURE_VIRTUALIZATION=true
VITE_FEATURE_EXPORT=true

EOF

log_success ".env.local criado"

# ============================================================================
# STEP 6: START SERVICES
# ============================================================================
log_title "STEP 6: Iniciando serviços de desenvolvimento"

log_info "Backend rodando em: http://localhost:8787"
log_info "Frontend rodará em: http://localhost:3000"

# Keep wrangler running
log_success "Wrangler está rodando (PID: $WRANGLER_PID)"

echo ""
log_title "Setup Completo! 🎉"
echo ""
echo -e "${CYAN}Abra um novo terminal e execute:${NC}"
echo ""
echo -e "  ${MAGENTA}npm run dev${NC}          # Inicia frontend em http://localhost:3000"
echo ""
echo -e "${CYAN}Seus dados de produção estão sincronizados e prontos:${NC}"
echo ""
echo -e "  Habilitações: ${GREEN}$HAB_LOCAL${NC}"
echo -e "  Qualificações: ${GREEN}$QUAL_LOCAL${NC}"
echo -e "  Funcionários: ${GREEN}$FUNC_LOCAL${NC}"
echo ""
echo -e "${CYAN}Desenvolvendo localmente agora 🚀${NC}"
echo ""
