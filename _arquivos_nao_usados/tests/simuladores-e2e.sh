#!/bin/bash

# ===============================================
# 🧪 TESTES E2E - MÓDULO SIMULADORES
# ===============================================
# 
# Script de testes end-to-end completo para validar
# todo o fluxo do módulo simuladores.
#
# Fluxo testado:
# 1. Criar simulador
# 2. Criar sessão/agendamento
# 3. Criar ficha de avaliação
# 4. Popular manobras na ficha
# 5. Assinar ficha
# 6. Gerar qualificação
# 7. Gerar relatórios
#
# Uso: ./tests/simuladores-e2e.sh [API_URL]
# ===============================================

set -e

# Configuração
API_URL="${1:-http://localhost:8787}"
TIMESTAMP=$(date +%s)
TEST_ID="E2E_$TIMESTAMP"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Contadores
TESTS_TOTAL=0
TESTS_PASSED=0
TESTS_FAILED=0

# ===============================================
# FUNÇÕES AUXILIARES
# ===============================================

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((TESTS_PASSED++))
    ((TESTS_TOTAL++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((TESTS_FAILED++))
    ((TESTS_TOTAL++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected_status=${5:-200}
    
    log_info "Teste: $name"
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n 1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq "$expected_status" ]; then
        log_success "$name - Status: $http_code"
        echo "$body"
        return 0
    else
        log_error "$name - Expected: $expected_status, Got: $http_code"
        echo "$body" | jq . 2>/dev/null || echo "$body"
        return 1
    fi
}

# ===============================================
# TESTES
# ===============================================

echo ""
echo "=================================="
echo "🧪 INICIANDO TESTES E2E"
echo "=================================="
echo "API: $API_URL"
echo "Test ID: $TEST_ID"
echo ""

# ------------------------------------------
# 1. HEALTH CHECK
# ------------------------------------------
log_info "1️⃣  HEALTH CHECK"
response=$(test_endpoint "Health Check" GET "/api/health")
echo ""

# ------------------------------------------
# 2. LISTAR SIMULADORES
# ------------------------------------------
log_info "2️⃣  LISTAR SIMULADORES"
response=$(test_endpoint "Listar Simuladores" GET "/api/simuladores")
simuladores_count=$(echo "$response" | jq '.data | length' 2>/dev/null || echo 0)
log_info "Total de simuladores: $simuladores_count"
echo ""

# ------------------------------------------
# 3. CRIAR SIMULADOR
# ------------------------------------------
log_info "3️⃣  CRIAR SIMULADOR"
simulador_data='{
  "codigo": "TEST-'$TEST_ID'",
  "tipo_aeronave": "FULL FLIGHT",
  "status": "DISPONIVEL",
  "fabricante": "CAE",
  "modelo": "AW139",
  "base": "GRU"
}'

response=$(test_endpoint "Criar Simulador" POST "/api/simuladores" "$simulador_data" 201)
simulador_id=$(echo "$response" | jq -r '.data.id' 2>/dev/null)

if [ -n "$simulador_id" ] && [ "$simulador_id" != "null" ]; then
    log_success "Simulador criado - ID: $simulador_id"
else
    log_error "Falha ao criar simulador"
    exit 1
fi
echo ""

# ------------------------------------------
# 4. BUSCAR SIMULADOR CRIADO
# ------------------------------------------
log_info "4️⃣  BUSCAR SIMULADOR CRIADO"
response=$(test_endpoint "Buscar Simulador" GET "/api/simuladores/$simulador_id")
echo ""

# ------------------------------------------
# 5. CRIAR SESSÃO/AGENDAMENTO
# ------------------------------------------
log_info "5️⃣  CRIAR SESSÃO/AGENDAMENTO"
data_sessao=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d "+1 day" +%Y-%m-%d)
sessao_data='{
  "simulador_id": '$simulador_id',
  "data": "'$data_sessao'",
  "hora_inicio": "09:00",
  "hora_fim": "11:00",
  "duracao_minutos": 120,
  "tipo_sessao": "TREINAMENTO",
  "funcionario_id": 1,
  "instrutor_id": 1,
  "observacoes": "Sessão de teste E2E '$TEST_ID'"
}'

response=$(test_endpoint "Criar Sessão" POST "/api/simuladores/sessoes" "$sessao_data" 201)
sessao_id=$(echo "$response" | jq -r '.data.id' 2>/dev/null)

if [ -n "$sessao_id" ] && [ "$sessao_id" != "null" ]; then
    log_success "Sessão criada - ID: $sessao_id"
else
    log_error "Falha ao criar sessão"
    exit 1
fi
echo ""

# ------------------------------------------
# 6. LISTAR SESSÕES
# ------------------------------------------
log_info "6️⃣  LISTAR SESSÕES"
response=$(test_endpoint "Listar Sessões" GET "/api/simuladores/sessoes")
sessoes_count=$(echo "$response" | jq '.data | length' 2>/dev/null || echo 0)
log_info "Total de sessões: $sessoes_count"
echo ""

# ------------------------------------------
# 7. CRIAR FICHA DE AVALIAÇÃO
# ------------------------------------------
log_info "7️⃣  CRIAR FICHA DE AVALIAÇÃO"
ficha_data='{
  "agendamento_slot_id": '$sessao_id',
  "colaborador_id_aluno": 1,
  "instrutor_id": 1,
  "funcao_na_sessao": "PF",
  "carga_horaria_total": 2.0,
  "status": "EM_PREENCHIMENTO"
}'

response=$(test_endpoint "Criar Ficha" POST "/api/simuladores/fichas" "$ficha_data" 201)
ficha_id=$(echo "$response" | jq -r '.data.id' 2>/dev/null)

if [ -n "$ficha_id" ] && [ "$ficha_id" != "null" ]; then
    log_success "Ficha criada - ID: $ficha_id"
else
    log_error "Falha ao criar ficha"
    exit 1
fi
echo ""

# ------------------------------------------
# 8. BUSCAR FICHA CRIADA
# ------------------------------------------
log_info "8️⃣  BUSCAR FICHA CRIADA"
response=$(test_endpoint "Buscar Ficha" GET "/api/simuladores/fichas/$ficha_id")
echo ""

# ------------------------------------------
# 9. LISTAR MANOBRAS
# ------------------------------------------
log_info "9️⃣  LISTAR MANOBRAS"
response=$(test_endpoint "Listar Manobras" GET "/api/simuladores/manobras")
manobras_count=$(echo "$response" | jq '.data | length' 2>/dev/null || echo 0)
log_info "Total de manobras cadastradas: $manobras_count"
echo ""

# ------------------------------------------
# 10. POPULAR MANOBRAS NA FICHA
# ------------------------------------------
log_info "🔟 POPULAR MANOBRAS NA FICHA"
if [ "$manobras_count" -gt 0 ]; then
    response=$(test_endpoint "Popular Manobras" POST "/api/simuladores/fichas-simulador/$ficha_id/popular-manobras")
    log_success "Manobras populadas na ficha"
else
    log_warning "Sem manobras para popular"
fi
echo ""

# ------------------------------------------
# 11. ATUALIZAR FICHA (CONCLUIR)
# ------------------------------------------
log_info "1️⃣1️⃣  ATUALIZAR FICHA (CONCLUIR)"
ficha_update='{
  "status": "CONCLUIDA",
  "nota_final": 85.5,
  "aprovado": true,
  "observacoes": "Teste E2E concluído com sucesso"
}'

response=$(test_endpoint "Atualizar Ficha" PUT "/api/simuladores/fichas/$ficha_id" "$ficha_update")
echo ""

# ------------------------------------------
# 12. ASSINAR FICHA (INSTRUTOR)
# ------------------------------------------
log_info "1️⃣2️⃣  ASSINAR FICHA (INSTRUTOR)"
assinatura_data='{
  "tipo": "INSTRUTOR",
  "usuario_id": 1
}'

response=$(test_endpoint "Assinar Ficha" POST "/api/simuladores/fichas/$ficha_id/assinar" "$assinatura_data")
echo ""

# ------------------------------------------
# 13. GERAR QUALIFICAÇÃO
# ------------------------------------------
log_info "1️⃣3️⃣  GERAR QUALIFICAÇÃO"
response=$(test_endpoint "Gerar Qualificação" POST "/api/simuladores/fichas-simulador/$ficha_id/gerar-qualificacao")
echo ""

# ------------------------------------------
# 14. RELATÓRIO DE USO
# ------------------------------------------
log_info "1️⃣4️⃣  RELATÓRIO DE USO"
data_inicio=$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d "-30 days" +%Y-%m-%d)
data_fim=$(date +%Y-%m-%d)
response=$(test_endpoint "Relatório de Uso" GET "/api/simuladores/relatorios/uso?data_inicio=$data_inicio&data_fim=$data_fim")
echo ""

# ------------------------------------------
# 15. RELATÓRIO DE TRIPULANTES
# ------------------------------------------
log_info "1️⃣5️⃣  RELATÓRIO DE TRIPULANTES"
response=$(test_endpoint "Relatório Tripulantes" GET "/api/simuladores/relatorios/tripulantes?data_inicio=$data_inicio&data_fim=$data_fim")
echo ""

# ------------------------------------------
# 16. RELATÓRIO DE DESEMPENHO
# ------------------------------------------
log_info "1️⃣6️⃣  RELATÓRIO DE DESEMPENHO"
response=$(test_endpoint "Relatório Desempenho" GET "/api/simuladores/relatorios/desempenho?data_inicio=$data_inicio&data_fim=$data_fim")
echo ""

# ------------------------------------------
# 17. ATUALIZAR SIMULADOR
# ------------------------------------------
log_info "1️⃣7️⃣  ATUALIZAR SIMULADOR"
simulador_update='{
  "status": "MANUTENCAO",
  "observacoes": "Teste E2E - Simulador em manutenção"
}'

response=$(test_endpoint "Atualizar Simulador" PUT "/api/simuladores/$simulador_id" "$simulador_update")
echo ""

# ------------------------------------------
# 18. ATUALIZAR SESSÃO
# ------------------------------------------
log_info "1️⃣8️⃣  ATUALIZAR SESSÃO"
sessao_update='{
  "status": "CONCLUIDO"
}'

response=$(test_endpoint "Atualizar Sessão" PUT "/api/simuladores/sessoes/$sessao_id" "$sessao_update")
echo ""

# ===============================================
# LIMPEZA (OPCIONAL - COMENTADO)
# ===============================================
# log_info "🧹 LIMPEZA"
# test_endpoint "Deletar Ficha" DELETE "/api/simuladores/fichas/$ficha_id"
# test_endpoint "Deletar Sessão" DELETE "/api/simuladores/sessoes/$sessao_id"
# test_endpoint "Deletar Simulador" DELETE "/api/simuladores/$simulador_id"
# echo ""

# ===============================================
# RESUMO
# ===============================================
echo ""
echo "=================================="
echo "📊 RESUMO DOS TESTES"
echo "=================================="
echo "Total: $TESTS_TOTAL"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ TODOS OS TESTES PASSARAM!${NC}"
    exit 0
else
    echo -e "${RED}❌ ALGUNS TESTES FALHARAM!${NC}"
    exit 1
fi
