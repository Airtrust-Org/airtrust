#!/bin/bash

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   🧪 TESTES E2E COMPLETOS - AIRTRUST API                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "API: https://airtrust-api-production.airtrust.workers.dev"
echo "Data: $(date '+%d/%m/%Y %H:%M:%S')"
echo ""

API_URL="https://airtrust-api-production.airtrust.workers.dev"
PASS=0
FAIL=0
TOTAL=0

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    local expect_success="${5:-true}"
    
    TOTAL=$((TOTAL + 1))
    echo -n "[$TOTAL] $name... "
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_URL$endpoint" 2>/dev/null)
    fi
    
    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')
    
    # Verifica se retornou sucesso (2xx)
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        if [ "$expect_success" = "true" ]; then
            echo -e "${GREEN}✓ PASSOU${NC} (HTTP $http_code)"
            PASS=$((PASS + 1))
            return 0
        else
            echo -e "${RED}✗ FALHOU${NC} (esperava erro, recebeu $http_code)"
            FAIL=$((FAIL + 1))
            return 1
        fi
    else
        if [ "$expect_success" = "false" ]; then
            echo -e "${GREEN}✓ PASSOU${NC} (erro esperado: $http_code)"
            PASS=$((PASS + 1))
            return 0
        else
            echo -e "${RED}✗ FALHOU${NC} (HTTP $http_code)"
            echo "    → $(echo "$body" | jq -r '.error // .message // .' 2>/dev/null | head -c 80)"
            FAIL=$((FAIL + 1))
            return 1
        fi
    fi
}

echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📋 MÓDULO: FUNCIONÁRIOS${NC}"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar funcionários" "GET" "/api/funcionarios"
test_endpoint "Buscar funcionários (com limite)" "GET" "/api/funcionarios?limit=5"
test_endpoint "Buscar funcionários (com paginação)" "GET" "/api/funcionarios?limit=10&offset=0"
test_endpoint "Listar funcionários ativos" "GET" "/api/funcionarios?status=ATIVO"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📋 MÓDULO: LICENÇAS${NC}"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar licenças" "GET" "/api/licencas"
test_endpoint "Listar licenças (com limite)" "GET" "/api/licencas?limit=5"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📋 MÓDULO: QUALIFICAÇÕES - TIPOS${NC}"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar tipos de qualificação" "GET" "/api/qualificacoes/tipos"
test_endpoint "Buscar tipos (com limite)" "GET" "/api/qualificacoes/tipos?limit=10"
test_endpoint "Buscar tipos ativos" "GET" "/api/qualificacoes/tipos?deleted_at=null"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📋 MÓDULO: QUALIFICAÇÕES - HISTÓRICO${NC}"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar histórico de qualificações" "GET" "/api/qualificacoes/historico"
test_endpoint "Buscar histórico (com limite)" "GET" "/api/qualificacoes/historico?limit=10"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📋 MÓDULO: CATEGORIAS${NC}"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar categorias" "GET" "/api/categorias"
test_endpoint "Buscar categorias ativas" "GET" "/api/categorias?deleted_at=null"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📋 MÓDULO: TEMPLATES${NC}"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar templates" "GET" "/api/templates"
test_endpoint "Buscar templates (com limite)" "GET" "/api/templates?limit=5"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📋 MÓDULO: MODELOS DE AERONAVE${NC}"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar modelos de aeronave" "GET" "/api/modelos-aeronave"
test_endpoint "Buscar modelos ativos" "GET" "/api/modelos-aeronave?deleted_at=null"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📋 MÓDULO: IMPORTAÇÃO - VALIDAÇÃO${NC}"
echo "═══════════════════════════════════════════════════════════"

# Teste 1: Validar funcionário válido
test_endpoint "Validar JSON funcionário (válido)" "POST" "/api/importacao/validar-json/funcionarios" '{
  "rows": [{
    "CPF": "123.456.789-09",
    "Nome": "TESTE E2E VALIDACAO",
    "Matricula": "E2E-VAL-001",
    "Nascimento": "01/01/1990",
    "Admissao": "01/06/2020"
  }],
  "modo": "UPSERT"
}'

# Teste 2: Validar funcionário com CPF inválido (deve retornar erro de validação)
test_endpoint "Validar JSON funcionário (CPF inválido)" "POST" "/api/importacao/validar-json/funcionarios" '{
  "rows": [{
    "CPF": "000.000.000-00",
    "Nome": "TESTE CPF INVALIDO",
    "Matricula": "INV-001"
  }],
  "modo": "INSERT"
}'

# Teste 3: Validar tipo de qualificação válido
test_endpoint "Validar JSON tipo qualificação (válido)" "POST" "/api/importacao/validar-json/qualificacoes_tipos" '{
  "rows": [{
    "codigo": "E2E-TIPO-001",
    "nome": "Teste E2E Tipo Qualificação",
    "validade": 12,
    "carga_horaria": 40
  }],
  "modo": "UPSERT"
}'

# Teste 4: Validar categoria válida
test_endpoint "Validar JSON categoria (válida)" "POST" "/api/importacao/validar-json/categorias" '{
  "rows": [{
    "codigo": "E2E-CAT-001",
    "nome": "Teste E2E Categoria"
  }],
  "modo": "UPSERT"
}'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📋 MÓDULO: IMPORTAÇÃO - EXECUÇÃO${NC}"
echo "═══════════════════════════════════════════════════════════"

# Teste 5: Executar importação de funcionário
test_endpoint "Executar importação funcionário" "POST" "/api/importacao/executar-json/funcionarios" '{
  "rows": [{
    "CPF": "98765432100",
    "Nome": "TESTE E2E IMPORT EXEC",
    "Matricula": "E2E-EXEC-001",
    "Nascimento": "1985-05-15",
    "Admissao": "2021-03-20"
  }],
  "mode": "UPSERT"
}'

# Teste 6: Executar importação de tipo
test_endpoint "Executar importação tipo qualificação" "POST" "/api/importacao/executar-json/qualificacoes_tipos" '{
  "rows": [{
    "codigo": "E2E-EXEC-TIPO-001",
    "nome": "Teste Execução Tipo E2E",
    "validade": 24,
    "carga_horaria": 80
  }],
  "mode": "UPSERT"
}'

# Teste 7: Executar importação de categoria
test_endpoint "Executar importação categoria" "POST" "/api/importacao/executar-json/categorias" '{
  "rows": [{
    "codigo": "E2E-EXEC-CAT-001",
    "nome": "Teste Execução Categoria E2E"
  }],
  "mode": "UPSERT"
}'

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📋 MÓDULO: SESSÕES E FICHAS${NC}"
echo "═══════════════════════════════════════════════════════════"

test_endpoint "Listar sessões" "GET" "/api/sessoes"
test_endpoint "Buscar sessões (com limite)" "GET" "/api/sessoes?limit=5"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo -e "${BLUE}📊 RESULTADO FINAL${NC}"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Total de testes executados: $TOTAL"
echo -e "${GREEN}✅ Passaram: $PASS${NC}"
echo -e "${RED}❌ Falharam: $FAIL${NC}"
echo ""

if [ $TOTAL -gt 0 ]; then
    PERCENTAGE=$(echo "scale=1; $PASS * 100 / $TOTAL" | bc)
    echo -e "Taxa de sucesso: ${BLUE}$PERCENTAGE%${NC}"
fi

echo ""
if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}🎉 TODOS OS TESTES PASSARAM! API 100% FUNCIONAL${NC}"
    exit 0
else
    if [ "$PERCENTAGE" -gt 80 ]; then
        echo -e "${YELLOW}⚠️  Alguns testes falharam, mas a maioria passou${NC}"
    else
        echo -e "${RED}❌ MUITOS TESTES FALHARAM - Verificar API${NC}"
    fi
    exit 1
fi
