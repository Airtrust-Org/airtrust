#!/bin/bash
# =========================================
# TEST EDAPP INTEGRATION
# Script de teste da integração AirTrust ↔ EdApp
# =========================================

set -e

API_URL="${API_URL:-https://airtrust-api-production.airtrust.workers.dev}"
WEBHOOK_SECRET="${EDAPP_WEBHOOK_SECRET:-}"

echo "🧪 ====================================="
echo "   TESTE INTEGRAÇÃO AIRTRUST ↔ EDAPP"
echo "====================================="
echo ""
echo "📍 API URL: $API_URL"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para log
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }
log_info() { echo -e "${YELLOW}ℹ️  $1${NC}"; }

# 1. Health Check
echo "1️⃣  Health Check..."
HEALTH=$(curl -s "$API_URL/api/integracoes/edapp/health")
echo "$HEALTH" | jq '.'
if echo "$HEALTH" | jq -e '.success == true' > /dev/null; then
  log_success "Health check OK"
else
  log_error "Health check falhou"
fi
echo ""

# 2. Stats
echo "2️⃣  Estatísticas..."
STATS=$(curl -s "$API_URL/api/integracoes/edapp/stats")
echo "$STATS" | jq '.'
echo ""

# 3. Listar Usuários Mapeados
echo "3️⃣  Usuários Mapeados..."
USUARIOS=$(curl -s "$API_URL/api/integracoes/edapp/usuarios")
echo "$USUARIOS" | jq '.data'
TOTAL_USUARIOS=$(echo "$USUARIOS" | jq '.data | length')
log_info "Total de usuários mapeados: $TOTAL_USUARIOS"
echo ""

# 4. Listar Cursos Mapeados
echo "4️⃣  Cursos Mapeados..."
CURSOS=$(curl -s "$API_URL/api/integracoes/edapp/cursos")
echo "$CURSOS" | jq '.data'
TOTAL_CURSOS=$(echo "$CURSOS" | jq '.data | length')
log_info "Total de cursos mapeados: $TOTAL_CURSOS"
echo ""

# 5. Teste Webhook (se secret configurado)
if [ -n "$WEBHOOK_SECRET" ]; then
  echo "5️⃣  Teste Webhook (course.completed)..."
  
  WEBHOOK_RESPONSE=$(curl -s -X POST "$API_URL/api/integracoes/edapp/webhook" \
    -H "X-EdApp-Secret: $WEBHOOK_SECRET" \
    -H "Content-Type: application/json" \
    -d '{
      "event": "course.completed",
      "data": {
        "user_id": "test-user-filipe",
        "course_id": "test-course-crm",
        "completed_at": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
        "score": 9.5,
        "user_name": "Filipe Daumas",
        "email": "filipe@teste.com"
      }
    }')
  
  echo "$WEBHOOK_RESPONSE" | jq '.'
  
  if echo "$WEBHOOK_RESPONSE" | jq -e '.success == true' > /dev/null; then
    log_success "Webhook processado com sucesso!"
    EVENTO_ID=$(echo "$WEBHOOK_RESPONSE" | jq -r '.data.evento_id')
    log_info "Evento ID: $EVENTO_ID"
  else
    log_error "Webhook falhou"
    ERROR_MSG=$(echo "$WEBHOOK_RESPONSE" | jq -r '.error // "Erro desconhecido"')
    log_info "Erro: $ERROR_MSG"
  fi
  echo ""
else
  echo "5️⃣  Teste Webhook..."
  log_info "EDAPP_WEBHOOK_SECRET não configurado - pulando teste de webhook"
  log_info "Configure: export EDAPP_WEBHOOK_SECRET='seu_secret'"
  echo ""
fi

# 6. Teste Webhook Inválido (sem secret)
echo "6️⃣  Teste Webhook Inválido (sem secret)..."
INVALID_RESPONSE=$(curl -s -X POST "$API_URL/api/integracoes/edapp/webhook" \
  -H "Content-Type: application/json" \
  -d '{"event": "course.completed", "data": {"user_id": "x", "course_id": "y"}}')
echo "$INVALID_RESPONSE" | jq '.'
if echo "$INVALID_RESPONSE" | jq -e '.error == "Unauthorized"' > /dev/null; then
  log_success "Segurança OK - requisição sem secret rejeitada"
else
  log_error "Segurança falhou - requisição deveria ser rejeitada"
fi
echo ""

# 7. Listar Eventos Recentes
echo "7️⃣  Eventos Recentes..."
EVENTOS=$(curl -s "$API_URL/api/integracoes/edapp/eventos?limit=5")
echo "$EVENTOS" | jq '.data'
TOTAL_EVENTOS=$(echo "$EVENTOS" | jq '.meta.total')
log_info "Total de eventos: $TOTAL_EVENTOS"
echo ""

# Resumo Final
echo "====================================="
echo "📊 RESUMO"
echo "====================================="
echo "Usuários mapeados: $TOTAL_USUARIOS"
echo "Cursos mapeados:   $TOTAL_CURSOS"
echo "Eventos totais:    $TOTAL_EVENTOS"
echo ""

if [ "$TOTAL_USUARIOS" -gt 0 ] && [ "$TOTAL_CURSOS" -gt 0 ]; then
  log_success "Integração EdApp configurada e funcionando!"
else
  log_info "Configure mapeamentos via API ou banco de dados"
fi

echo ""
echo "🏁 Teste concluído!"
