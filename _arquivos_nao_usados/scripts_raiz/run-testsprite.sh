#!/bin/bash

# 🧪 Script para executar testes TestSprite
# Data: 14/11/2025

set -e

echo "🚀 Iniciando testes TestSprite..."
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se Python está instalado
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 não encontrado. Instale Python 3 primeiro.${NC}"
    exit 1
fi

# Verificar se requests está instalado
if ! python3 -c "import requests" &> /dev/null; then
    echo -e "${YELLOW}⚠️  Biblioteca 'requests' não encontrada. Instalando...${NC}"
    pip3 install requests
fi

#!/bin/bash

# Script para executar todos os testes TestSprite
# Uso: ./run-testsprite.sh [BASE_URL]
# Exemplo: ./run-testsprite.sh https://meuworker.workers.dev

# Define a URL base (padrão: localhost para desenvolvimento)
BASE_URL="${1:-http://localhost:8787}"

echo -e "${GREEN}🌐 Base URL: ${BASE_URL}${NC}"
echo ""

# Contador de testes
TOTAL=0
PASSED=0
FAILED=0

# Diretório de testes
TEST_DIR="testsprite_tests"

if [ ! -d "$TEST_DIR" ]; then
    echo -e "${RED}❌ Diretório de testes não encontrado: $TEST_DIR${NC}"
    exit 1
fi

# Função para executar um teste
run_test() {
    local test_file=$1
    local test_name=$(basename "$test_file" .py)
    
    echo -e "${YELLOW}🧪 Executando: $test_name${NC}"
    
    TOTAL=$((TOTAL + 1))
    
    # Exportar BASE_URL para o script Python
    export BASE_URL
    
    if python3 "$test_file"; then
        echo -e "${GREEN}✅ $test_name: PASSOU${NC}"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}❌ $test_name: FALHOU${NC}"
        FAILED=$((FAILED + 1))
    fi
    
    echo ""
}

# Executar todos os testes TC*.py
echo "🔍 Procurando testes em $TEST_DIR..."
echo ""

for test_file in "$TEST_DIR"/TC*.py; do
    if [ -f "$test_file" ]; then
        run_test "$test_file"
    fi
done

# Resumo final
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}📊 RESUMO DOS TESTES${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Total de testes: $TOTAL"
echo -e "${GREEN}✅ Passaram: $PASSED${NC}"
echo -e "${RED}❌ Falharam: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 Todos os testes passaram!${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Alguns testes falharam.${NC}"
    exit 1
fi
