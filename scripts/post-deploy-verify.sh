#!/bin/bash

################################################################################
# PÓS-DEPLOY VERIFICATION CHECKLIST
# Execute após cada deploy para validar que tudo está funcionando
#
# Uso: ./scripts/post-deploy-verify.sh
################################################################################

set +e  # Don't exit on error, we want to check all items

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0

check_url() {
  local num=$1
  local desc=$2
  local url=$3
  local expected_status=${4:-200}
  
  echo -e "\n${BLUE}[${num}]${NC} ${desc}"
  echo "   URL: $url"
  
  local status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  
  if [ "$status" = "$expected_status" ]; then
    echo -e "   ${GREEN}✅ Status $status${NC}"
    ((PASSED++))
    return 0
  else
    echo -e "   ${RED}❌ Status $status (esperado $expected_status)${NC}"
    ((FAILED++))
    return 1
  fi
}

check_endpoint() {
  local num=$1
  local desc=$2
  local endpoint=$3
  local method=${4:-GET}
  
  echo -e "\n${BLUE}[${num}]${NC} ${desc}"
  echo "   Endpoint: $method $endpoint"
  
  local cmd="curl -s -X $method"
  if [ "$method" = "POST" ]; then
    cmd="$cmd -H 'Content-Type: application/json' -d '{}'"
  fi
  cmd="$cmd -o /dev/null -w '%{http_code}' $endpoint"
  
  local status=$(eval "$cmd")
  
  if [ "$status" = "200" ] || [ "$status" = "201" ]; then
    echo -e "   ${GREEN}✅ Status $status${NC}"
    ((PASSED++))
    return 0
  else
    echo -e "   ${RED}❌ Status $status${NC}"
    ((FAILED++))
    return 1
  fi
}

echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo -e "${BLUE}🔍 PÓS-DEPLOY VERIFICATION CHECKLIST${NC}"
echo -e "${BLUE}════════════════════════════════════════════${NC}"

# ============================================
# FRONTEND URLS
# ============================================
echo -e "\n${BLUE}🌐 FRONTEND URLS${NC}"
check_url "1" "Production Frontend Homepage" "https://production.airtrust.pages.dev" 200
check_url "2" "Frontend Assets" "https://production.airtrust.pages.dev/assets" 404  # Deve 404, é um diretório
check_url "3" "Frontend com rota /qualificacoes" "https://production.airtrust.pages.dev/qualificacoes" 200

# ============================================
# BACKEND HEALTH
# ============================================
echo -e "\n${BLUE}⚙️  BACKEND HEALTH${NC}"
check_url "4" "Worker Health Endpoint" "https://airtrust-api.airtrust.workers.dev/health" 200
check_url "5" "Worker Root" "https://airtrust-api.airtrust.workers.dev/" 200

# ============================================
# API ENDPOINTS - CATEGORIES
# ============================================
echo -e "\n${BLUE}📋 API ENDPOINTS - CATEGORIES${NC}"
check_endpoint "6" "GET Categorias" "https://airtrust-api.airtrust.workers.dev/api/categorias" GET
check_endpoint "7" "GET Tipos" "https://airtrust-api.airtrust.workers.dev/api/tipos" GET

# ============================================
# API ENDPOINTS - FUNCIONÁRIOS
# ============================================
echo -e "\n${BLUE}👥 API ENDPOINTS - FUNCIONÁRIOS${NC}"
check_endpoint "8" "GET Funcionários" "https://airtrust-api.airtrust.workers.dev/api/funcionarios" GET
check_endpoint "9" "GET Funcionário (ID 1)" "https://airtrust-api.airtrust.workers.dev/api/funcionarios/1" GET

# ============================================
# API ENDPOINTS - QUALIFICAÇÕES
# ============================================
echo -e "\n${BLUE}🎓 API ENDPOINTS - QUALIFICAÇÕES${NC}"
check_endpoint "10" "GET Qualificações" "https://airtrust-api.airtrust.workers.dev/api/qualificacoes" GET
check_endpoint "11" "GET Qualificações por Funcionário" "https://airtrust-api.airtrust.workers.dev/api/qualificacoes/funcionario/1" GET

# ============================================
# API ENDPOINTS - CERTIFICADOS (Crítico)
# ============================================
echo -e "\n${BLUE}📜 API ENDPOINTS - CERTIFICADOS (CRÍTICO)${NC}"
check_endpoint "12" "GET Certificados" "https://airtrust-api.airtrust.workers.dev/api/qualificacoes/historico/1/certificados" GET

# ============================================
# CORS & SECURITY
# ============================================
echo -e "\n${BLUE}🔒 CORS & SECURITY${NC}"

echo -e "\n${BLUE}[13]${NC} CORS Headers"
local cors=$(curl -s -I https://airtrust-api.airtrust.workers.dev/api/categorias | grep -i "access-control")
if [ -n "$cors" ]; then
  echo -e "   ${GREEN}✅ CORS Headers Present${NC}"
  echo "   $cors"
  ((PASSED++))
else
  echo -e "   ${YELLOW}⚠️  No CORS Headers${NC}"
fi

echo -e "\n${BLUE}[14]${NC} Security Headers"
local security=$(curl -s -I https://production.airtrust.pages.dev | grep -i "x-frame-options\|x-content-type")
if [ -n "$security" ]; then
  echo -e "   ${GREEN}✅ Security Headers Present${NC}"
  ((PASSED++))
else
  echo -e "   ${YELLOW}⚠️  No Security Headers${NC}"
fi

# ============================================
# DATABASE CONNECTIVITY
# ============================================
echo -e "\n${BLUE}🗄️  DATABASE CONNECTIVITY${NC}"

echo -e "\n${BLUE}[15]${NC} Database has records (Categorias)"
local count=$(curl -s https://airtrust-api.airtrust.workers.dev/api/categorias | grep -o '"id"' | wc -l)
if [ "$count" -gt 0 ]; then
  echo -e "   ${GREEN}✅ Found $count records${NC}"
  ((PASSED++))
else
  echo -e "   ${RED}❌ No records found${NC}"
  ((FAILED++))
fi

echo -e "\n${BLUE}[16]${NC} Database has records (Funcionários)"
local count=$(curl -s https://airtrust-api.airtrust.workers.dev/api/funcionarios | grep -o '"id"' | wc -l)
if [ "$count" -gt 0 ]; then
  echo -e "   ${GREEN}✅ Found $count records${NC}"
  ((PASSED++))
else
  echo -e "   ${RED}❌ No records found${NC}"
  ((FAILED++))
fi

# ============================================
# PERFORMANCE
# ============================================
echo -e "\n${BLUE}⚡ PERFORMANCE${NC}"

echo -e "\n${BLUE}[17]${NC} Frontend Response Time"
local time=$(curl -s -w "%{time_total}" -o /dev/null https://production.airtrust.pages.dev)
echo -e "   Response time: ${time}s"
local int_time=$(printf "%.0f" $(echo "$time * 1000" | bc))
if [ "$int_time" -lt 3000 ]; then
  echo -e "   ${GREEN}✅ Fast (<3s)${NC}"
  ((PASSED++))
else
  echo -e "   ${YELLOW}⚠️  Slow (>3s)${NC}"
fi

echo -e "\n${BLUE}[18]${NC} API Response Time"
local time=$(curl -s -w "%{time_total}" -o /dev/null https://airtrust-api.airtrust.workers.dev/api/categorias)
echo -e "   Response time: ${time}s"
local int_time=$(printf "%.0f" $(echo "$time * 1000" | bc))
if [ "$int_time" -lt 1000 ]; then
  echo -e "   ${GREEN}✅ Fast (<1s)${NC}"
  ((PASSED++))
else
  echo -e "   ${YELLOW}⚠️  Slow (>1s)${NC}"
fi

# ============================================
# RESUMO
# ============================================
TOTAL=$((PASSED + FAILED))
echo -e "\n${BLUE}════════════════════════════════════════════${NC}"
echo -e "${BLUE}📊 RESULTADO FINAL${NC}"
echo -e "${GREEN}✅ Passou: $PASSED/$TOTAL${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}❌ Falhou: $FAILED${NC}"
fi

if [ $FAILED -eq 0 ]; then
  echo -e "\n${GREEN}🎉 DEPLOY COMPLETADO COM SUCESSO!${NC}"
  exit 0
else
  echo -e "\n${RED}⚠️  ALGUNS TESTES FALHARAM${NC}"
  echo -e "Verifique os logs acima para mais detalhes"
  exit 1
fi
