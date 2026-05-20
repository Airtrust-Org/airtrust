#!/bin/bash

# ═══════════════════════════════════════════════════════════════
# 🔧 SCRIPT LOCAL: VALIDAÇÃO DE CERTIFICADOS (DEV)
# AirTrust - Testes Locais
# ═══════════════════════════════════════════════════════════════

set -e

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Config
DEV_URL="http://localhost:3000"
FUNCIONARIO_ID="39"
LOG_FILE="validate-local-$(date +%Y%m%d_%H%M%S).log"

# Funções
log_info() { echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1" | tee -a "$LOG_FILE"; }
log_error() { echo -e "${RED}[✗]${NC} $1" | tee -a "$LOG_FILE"; }
log_warning() { echo -e "${YELLOW}[!]${NC} $1" | tee -a "$LOG_FILE"; }
section() { echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}\n${BLUE}$1${NC}\n${BLUE}═══════════════════════════════════════════════════════════════${NC}\n" | tee -a "$LOG_FILE"; }

# ═════════════════════════════════════════════════════════════
section "TESTE 1: VERIFICAR SERVIDOR DE DEV"

log_info "Verificando se servidor está rodando em $DEV_URL..."

if curl -s "$DEV_URL/api/v2/health" > /dev/null 2>&1; then
  log_success "Servidor DEV está rodando ✅"
else
  log_error "Servidor DEV não está rodando"
  log_info "Inicie com: npm run dev"
  exit 1
fi

# ═════════════════════════════════════════════════════════════
section "TESTE 2: GET /api/v2/certificados/funcionario/:id (ANTES)"

log_info "Testando listagem antes de deletar..."

RESPONSE_BEFORE=$(curl -s -X GET "$DEV_URL/api/v2/certificados/funcionario/$FUNCIONARIO_ID")

echo "Resposta:" | tee -a "$LOG_FILE"
echo "$RESPONSE_BEFORE" | jq . 2>/dev/null || echo "$RESPONSE_BEFORE" | tee -a "$LOG_FILE"

COUNT_BEFORE=$(echo "$RESPONSE_BEFORE" | jq '.data | length // 0' 2>/dev/null || echo "0")
log_info "Total de certificados ANTES: $COUNT_BEFORE"

# ═════════════════════════════════════════════════════════════
section "TESTE 3: DELETE /api/v2/certificados/delete-all-certificates"

if [ "$COUNT_BEFORE" -eq 0 ]; then
  log_warning "Já está vazio, pulando DELETE"
else
  log_warning "⚠️  Vai deletar $COUNT_BEFORE certificados"
  
  DELETE_RESPONSE=$(curl -s -X DELETE "$DEV_URL/api/v2/certificados/delete-all-certificates")
  
  echo "Resposta:" | tee -a "$LOG_FILE"
  echo "$DELETE_RESPONSE" | jq . 2>/dev/null || echo "$DELETE_RESPONSE" | tee -a "$LOG_FILE"
  
  if echo "$DELETE_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    DELETED=$(echo "$DELETE_RESPONSE" | jq '.deleted_count // 0' 2>/dev/null)
    log_success "DELETE executado: $DELETED certificados deletados"
  else
    log_error "DELETE falhou"
  fi
fi

# ═════════════════════════════════════════════════════════════
section "TESTE 4: GET /api/v2/certificados/funcionario/:id (DEPOIS)"

log_info "Testando listagem após deletar..."

RESPONSE_AFTER=$(curl -s -X GET "$DEV_URL/api/v2/certificados/funcionario/$FUNCIONARIO_ID")

echo "Resposta:" | tee -a "$LOG_FILE"
echo "$RESPONSE_AFTER" | jq . 2>/dev/null || echo "$RESPONSE_AFTER" | tee -a "$LOG_FILE"

COUNT_AFTER=$(echo "$RESPONSE_AFTER" | jq '.data | length // 0' 2>/dev/null || echo "0")
log_info "Total de certificados DEPOIS: $COUNT_AFTER"

# ═════════════════════════════════════════════════════════════
section "TESTE 5: COMPARATIVO"

cat << EOF | tee -a "$LOG_FILE"

ANTES vs DEPOIS:
  Certificados ANTES: $COUNT_BEFORE
  Certificados DEPOIS: $COUNT_AFTER
  Deletados: $((COUNT_BEFORE - COUNT_AFTER))

EOF

if [ "$COUNT_AFTER" -eq 0 ]; then
  log_success "✅ SUCESSO: Sistema está limpo!"
else
  log_warning "⚠️  Ainda há certificados no sistema"
fi

# ═════════════════════════════════════════════════════════════
section "TESTE 6: HEALTH CHECK"

HEALTH=$(curl -s -X GET "$DEV_URL/api/v2/health")

echo "$HEALTH" | jq . 2>/dev/null || echo "$HEALTH" | tee -a "$LOG_FILE"

if echo "$HEALTH" | jq -e '.success' > /dev/null 2>&1; then
  log_success "Sistema operacional ✅"
else
  log_error "Sistema com problemas"
fi

# ═════════════════════════════════════════════════════════════
section "TESTE 7: ENDPOINTS TESTADOS"

cat << 'EOF' | tee -a "$LOG_FILE"

✅ GET  /api/v2/certificados/funcionario/:id
✅ DELETE /api/v2/certificados/delete-all-certificates
✅ GET  /api/v2/health

🔄 Fluxo:
  1. Listar certificados (GET)
  2. Deletar todos (DELETE)
  3. Re-listar (GET)
  4. Verificar saúde (HEALTH)

EOF

# ═════════════════════════════════════════════════════════════
section "RESUMO FINAL"

cat << EOF | tee -a "$LOG_FILE"

📊 VALIDAÇÃO LOCAL CONCLUÍDA

Testes Executados:
  ✓ Teste 1: Servidor DEV rodando
  ✓ Teste 2: GET antes de deletar ($COUNT_BEFORE certs)
  ✓ Teste 3: DELETE endpoint
  ✓ Teste 4: GET depois de deletar ($COUNT_AFTER certs)
  ✓ Teste 5: Comparativo
  ✓ Teste 6: Health check
  ✓ Teste 7: Endpoints listados

📝 Relatório: $LOG_FILE

🎯 STATUS: $([ "$COUNT_AFTER" -eq 0 ] && echo "✅ LIMPO" || echo "⚠️  COM DADOS")

EOF

log_success "✅ SCRIPT COMPLETO!"

# ═════════════════════════════════════════════════════════════
