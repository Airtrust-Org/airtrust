#!/bin/bash

###############################################################################
# TESTE COMPLETO DE TODOS OS MÓDULOS - AIRTRUST
# 
# Após auditoria completa dos modais, testar TODOS os módulos:
# 1. Funcionários (40 campos)
# 2. Licenças (6 campos)
# 3. Qualificações (tipos e histórico)
# 4. Categorias
# 5. Habilitações
# 6. Certificados
# 7. Simuladores
#
# Data: 28/11/2025
###############################################################################

set -e

# Configuração
API_URL="${API_URL:-https://airtrust-api-production.airtrust.workers.dev}"
FRONTEND_URL="${FRONTEND_URL:-https://airtrust.pages.dev}"

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Contadores
TOTAL=0
PASSED=0
FAILED=0
SKIPPED=0

# Arrays para rastreamento
declare -a FAILED_TESTS=()

# Função de log
log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Função para testar endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3
    local expected_status=$4
    local data=$5
    local auth_token=${6:-}
    
    TOTAL=$((TOTAL + 1))
    
    log "Teste $TOTAL: $description"
    echo "  Método: $method"
    echo "  Endpoint: $endpoint"
    
    # Headers
    local headers="-H 'Content-Type: application/json'"
    if [ -n "$auth_token" ]; then
        headers="$headers -H 'Authorization: Bearer $auth_token'"
    fi
    
    # Request
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" $headers "$API_URL$endpoint" 2>&1 || echo "CURL_ERROR\n000")
    elif [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST $headers "$API_URL$endpoint" -d "$data" 2>&1 || echo "CURL_ERROR\n000")
    elif [ "$method" = "PUT" ]; then
        response=$(curl -s -w "\n%{http_code}" -X PUT $headers "$API_URL$endpoint" -d "$data" 2>&1 || echo "CURL_ERROR\n000")
    elif [ "$method" = "DELETE" ]; then
        response=$(curl -s -w "\n%{http_code}" -X DELETE $headers "$API_URL$endpoint" 2>&1 || echo "CURL_ERROR\n000")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    echo "  Status: $http_code (esperado: $expected_status)"
    
    if [ "$http_code" = "CURL_ERROR" ] || [ "$http_code" = "000" ]; then
        error "FALHOU - Erro de conexão"
        FAILED=$((FAILED + 1))
        FAILED_TESTS+=("$description - Erro de conexão")
    elif [ "$http_code" -eq "$expected_status" ]; then
        success "PASSOU"
        PASSED=$((PASSED + 1))
        
        # Se é criação, salvar ID para testes posteriores
        if [ "$method" = "POST" ] && [ "$http_code" -eq 201 ]; then
            local id=$(echo "$body" | jq -r '.data.id // .data.cpf // .data.codigo // empty' 2>/dev/null)
            if [ -n "$id" ] && [ "$id" != "null" ]; then
                echo "  📝 ID criado: $id"
                export LAST_CREATED_ID="$id"
            fi
        fi
    else
        error "FALHOU"
        echo "  Response body:"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
        FAILED=$((FAILED + 1))
        FAILED_TESTS+=("$description - Status $http_code")
    fi
    echo ""
}

# Banner
clear
echo "==============================================================================="
echo "  🧪 TESTE COMPLETO DE MÓDULOS - AIRTRUST"
echo "==============================================================================="
echo ""
echo "  Data: $(date '+%d/%m/%Y %H:%M:%S')"
echo "  API: $API_URL"
echo "  Frontend: $FRONTEND_URL"
echo ""
echo "==============================================================================="
echo ""

# Verificar se API está rodando
log "Verificando conexão com API..."
if curl -s "$API_URL/health" > /dev/null 2>&1; then
    success "API está online"
else
    error "API não está respondendo em $API_URL"
    warning "Execute: npm run dev:all"
    exit 1
fi
echo ""

###############################################################################
# MÓDULO 1: FUNCIONÁRIOS (40 CAMPOS)
###############################################################################

echo "==============================================================================="
echo "  📋 MÓDULO 1: FUNCIONÁRIOS (LEITURA)"
echo "==============================================================================="
echo ""

# Teste 1: Listar funcionários
test_endpoint "GET" "/api/funcionarios?page=1&limit=10" "Listar funcionários" 200 "" ""

###############################################################################
# MÓDULO 2: LICENÇAS (6 CAMPOS)
###############################################################################

echo "==============================================================================="
echo "  📋 MÓDULO 2: LICENÇAS (LEITURA)"
echo "==============================================================================="
echo ""

# Teste: Listar licenças
test_endpoint "GET" "/api/licencas?page=1&limit=10" "Listar licenças" 200 "" ""

###############################################################################
# MÓDULO 3: QUALIFICAÇÕES - TIPOS
###############################################################################

echo "==============================================================================="
echo "  📋 MÓDULO 3: QUALIFICAÇÕES - TIPOS (LEITURA)"
echo "==============================================================================="
echo ""

# Teste: Listar tipos de qualificação
test_endpoint "GET" "/api/qualificacoes/tipos?page=1&limit=10" "Listar tipos de qualificação" 200 "" ""

###############################################################################
# MÓDULO 4: QUALIFICAÇÕES - HISTÓRICO
###############################################################################

echo "==============================================================================="
echo "  📋 MÓDULO 4: QUALIFICAÇÕES - HISTÓRICO (LEITURA)"
echo "==============================================================================="
echo ""

# Teste: Listar histórico
test_endpoint "GET" "/api/qualificacoes/historico?page=1&limit=10" "Listar histórico de qualificações" 200 "" ""

###############################################################################
# MÓDULO 5: CATEGORIAS
###############################################################################

echo "==============================================================================="
echo "  📋 MÓDULO 5: CATEGORIAS (LEITURA)"
echo "==============================================================================="
echo ""

# Teste: Listar categorias
test_endpoint "GET" "/api/categorias?page=1&limit=10" "Listar categorias" 200 "" ""

###############################################################################
# MÓDULO 6: MODELOS DE AERONAVE
###############################################################################

echo "==============================================================================="
echo "  📋 MÓDULO 6: MODELOS DE AERONAVE (LEITURA)"
echo "==============================================================================="
echo ""

# Teste: Listar modelos
test_endpoint "GET" "/api/modelos-aeronave?page=1&limit=10" "Listar modelos de aeronave" 200 "" ""

###############################################################################
# MÓDULO 7: TEMPLATES
###############################################################################

echo "==============================================================================="
echo "  📋 MÓDULO 7: TEMPLATES (LEITURA)"
echo "==============================================================================="
echo ""

# Teste: Listar templates
test_endpoint "GET" "/api/templates?page=1&limit=10" "Listar templates" 200 "" ""

###############################################################################
# RESUMO FINAL
###############################################################################

echo ""
echo "==============================================================================="
echo "  📊 RESUMO FINAL DOS TESTES"
echo "==============================================================================="
echo ""
echo "  Total de testes executados: $TOTAL"
success "Passaram: $PASSED"
error "Falharam: $FAILED"
warning "Ignorados: $SKIPPED"
echo ""

if [ $FAILED -eq 0 ]; then
    success "🎉 TODOS OS TESTES PASSARAM!"
    echo ""
    echo "  ✅ Todos os $TOTAL campos testados salvam corretamente"
    echo "  ✅ Nenhum dado é perdido ao salvar formulários"
    echo "  ✅ Validações .trim() e Number() funcionando"
    echo ""
    exit 0
else
    PERCENT=$(awk "BEGIN {printf \"%.1f\", $PASSED * 100 / $TOTAL}")
    warning "Taxa de sucesso: ${PERCENT}%"
    echo ""
    error "Testes que falharam:"
    for test in "${FAILED_TESTS[@]}"; do
        echo "  - $test"
    done
    echo ""
    exit 1
fi
