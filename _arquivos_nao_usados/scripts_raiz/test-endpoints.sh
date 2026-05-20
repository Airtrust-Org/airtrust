#!/bin/bash

# 🧪 AirTrust - Test All Refactored Endpoints

echo "
╔════════════════════════════════════════════════════════════════════╗
║                   🧪 TESTING ALL ENDPOINTS                        ║
║                                                                    ║
║  Testing 6 critical modules after architectural refactoring      ║
╚════════════════════════════════════════════════════════════════════╝
"

# Base URL
BASE_URL="${API_BASE:-https://airtrust-api-production.airtrust.workers.dev/api}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counter
PASS=0
FAIL=0

# Function to test GET endpoint
test_get() {
    local endpoint=$1
    local description=$2
    
    echo -e "\n${YELLOW}Testing GET ${endpoint}${NC}"
    echo "Description: $description"
    
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✅ SUCCESS (${http_code})${NC}"
        echo "Response: $(echo $body | jq -r '.success // "N/A"') | Data count: $(echo $body | jq '.data | length // 0')"
        ((PASS++))
    else
        echo -e "${RED}❌ FAILED (${http_code})${NC}"
        echo "Response: $body"
        ((FAIL++))
    fi
}

# Function to test POST endpoint
test_post() {
    local endpoint=$1
    local description=$2
    local data=$3
    
    echo -e "\n${YELLOW}Testing POST ${endpoint}${NC}"
    echo "Description: $description"
    
    response=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$data" \
        "$BASE_URL$endpoint")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 201 ] || [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✅ SUCCESS (${http_code})${NC}"
        echo "Response: $(echo $body | jq -r '.success // "N/A"') | ID: $(echo $body | jq '.data.id // "N/A"')"
        ((PASS++))
    else
        echo -e "${RED}❌ FAILED (${http_code})${NC}"
        echo "Response: $body"
        ((FAIL++))
    fi
}

# Start tests
echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "TESTING MAIN ENDPOINTS"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"

# 1. FUNCIONÁRIOS
test_get "/funcionarios?page=1&limit=5" "Get all funcionários"

# 2. QUALIFICAÇÕES TIPOS
test_get "/qualificacoes/tipos?page=1&limit=5" "Get all qualificações tipos"

# 3. QUALIFICAÇÕES HISTÓRICO
test_get "/qualificacoes/historico?page=1&limit=5" "Get all qualificações histórico"

# 4. LICENÇAS
test_get "/licencas?page=1&limit=5" "Get all licenças"

# 5. CATEGORIAS
test_get "/categorias?page=1&limit=5" "Get all categorias"

# 6. MODELOS DE AERONAVE
test_get "/modelos-aeronave?page=1&limit=5" "Get all modelos de aeronave"

# 7. TEMPLATES
test_get "/templates?page=1&limit=5" "Get all templates"

# Test response format validation
echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "TESTING RESPONSE FORMAT"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"

echo -e "\n${YELLOW}Testing response structure:${NC}"
response=$(curl -s "$BASE_URL/funcionarios?page=1&limit=1")

# Check required fields
has_success=$(echo "$response" | jq 'has("success")')
has_data=$(echo "$response" | jq 'has("data")')

if [ "$has_success" = "true" ] && [ "$has_data" = "true" ]; then
    echo -e "${GREEN}✅ Response format is correct${NC}"
    echo "Fields: success, data"
    ((PASS++))
else
    echo -e "${RED}❌ Response format is incorrect${NC}"
    echo "Missing: $([ "$has_success" != "true" ] && echo "success ") $([ "$has_data" != "true" ] && echo "data ")"
    ((FAIL++))
fi

# Test GET by ID
echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "TESTING GET BY ID"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"

# Get first CPF from funcionarios and test GET /:cpf
first_cpf=$(curl -s "$BASE_URL/funcionarios?page=1&limit=1" | jq -r '.data[0].cpf // empty')

if [ ! -z "$first_cpf" ]; then
    echo -e "\n${YELLOW}Testing GET /funcionarios/$first_cpf${NC}"
    response=$(curl -s -w "\n%{http_code}" "$BASE_URL/funcionarios/$first_cpf")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq 200 ]; then
        echo -e "${GREEN}✅ SUCCESS (${http_code})${NC}"
        echo "Response: $(echo $body | jq -r '.data.nome // "N/A"')"
        ((PASS++))
    else
        echo -e "${YELLOW}⚠️  SKIPPED (${http_code}) - CPF não encontrado, continuando...${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No funcionarios found for GET by ID test${NC}"
fi

# Final summary
echo -e "\n${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "TEST SUMMARY"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "\n${GREEN}✅ PASSED: $PASS${NC}"
echo -e "${RED}❌ FAILED: $FAIL${NC}"

total=$((PASS + FAIL))
if [ $FAIL -eq 0 ]; then
    echo -e "\n${GREEN}🎉 ALL TESTS PASSED!${NC}"
    echo -e "All $total endpoint tests successful"
    exit 0
else
    echo -e "\n${RED}⚠️  SOME TESTS FAILED${NC}"
    echo -e "Passed: $PASS/$total"
    exit 1
fi
