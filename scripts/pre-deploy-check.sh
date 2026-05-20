#!/bin/bash

################################################################################
# PRE-DEPLOY CHECKLIST
# Ferramenta interativa para validar deploy antes de enviar
#
# Uso: ./scripts/pre-deploy-check.sh
################################################################################

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASSED=0
FAILED=0
WARNINGS=0

check_item() {
  local num=$1
  local desc=$2
  local cmd=$3
  
  echo -e "\n${BLUE}[${num}]${NC} ${desc}"
  
  if eval "$cmd" > /dev/null 2>&1; then
    echo -e "   ${GREEN}✅ PASSOU${NC}"
    ((PASSED++))
    return 0
  else
    echo -e "   ${RED}❌ FALHOU${NC}"
    ((FAILED++))
    return 1
  fi
}

warn_item() {
  local num=$1
  local desc=$2
  
  echo -e "\n${YELLOW}[${num}]${NC} ${desc}"
  echo -e "   ${YELLOW}⚠️  AVISO${NC}"
  ((WARNINGS++))
}

echo -e "${BLUE}════════════════════════════════════════════${NC}"
echo -e "${BLUE}🔍 PRE-DEPLOY CHECKLIST - AirTrust v1${NC}"
echo -e "${BLUE}════════════════════════════════════════════${NC}"

# ============================================
# GIT CHECKS
# ============================================
echo -e "\n${BLUE}📦 GIT CHECKS${NC}"
check_item "1" "Branch é main ou production" "git rev-parse --abbrev-ref HEAD | grep -E '^(main|production)$'"
check_item "2" "Sem mudanças uncommitted" "! git diff --quiet && ! git diff --cached --quiet && exit 1 || exit 0"
check_item "3" "Upstream atualizado" "git fetch origin && git status | grep -q 'up to date' || git status | grep -q 'up.to.date'"

# ============================================
# BUILD CHECKS
# ============================================
echo -e "\n${BLUE}🔨 BUILD CHECKS${NC}"
check_item "4" "dist/client/ existe" "test -d dist/client"
check_item "5" "dist/ tem arquivos" "test $(find dist -type f | wc -l) -gt 10"
check_item "6" "index.html existe" "test -f dist/client/index.html"
check_item "7" "Assets compilados" "test -d dist/client/assets && test $(find dist/client/assets -type f | wc -l) -gt 0"

# ============================================
# BACKEND CHECKS
# ============================================
echo -e "\n${BLUE}⚙️  BACKEND CHECKS${NC}"
check_item "8" "Worker-airtrust existe" "test -d worker-airtrust"
check_item "9" "wrangler.toml configurado" "test -f worker-airtrust/wrangler.toml"
check_item "10" "Endpoints de certificados existem" "grep -q 'historico/:id/certificados' worker-airtrust/src/routes/qualificacoes.ts"

# ============================================
# CONFIG CHECKS
# ============================================
echo -e "\n${BLUE}⚙️  CONFIG CHECKS${NC}"
check_item "11" "API_BASE_URL configurado" "grep -q 'API_BASE_URL' src/react-app/config/api.ts"
check_item "12" "GitHub Actions disponível" "test -d .github/workflows"

# ============================================
# OPTIONAL WARNINGS
# ============================================
echo -e "\n${BLUE}⚠️  AVISOS INFORMATIVOS${NC}"

if git log --oneline -1 | grep -qi "WIP\|TODO\|FIXME"; then
  warn_item "W1" "Último commit tem WIP/TODO/FIXME"
fi

if [ $(git diff origin/main...HEAD --name-only | wc -l) -gt 50 ]; then
  warn_item "W2" "Muitos arquivos mudados (>50)"
fi

if ! grep -q "dist/" .gitignore; then
  warn_item "W3" "dist/ está no .gitignore (mas será forçado com -f)"
fi

# ============================================
# RESUMO
# ============================================
TOTAL=$((PASSED + FAILED))
echo -e "\n${BLUE}════════════════════════════════════════════${NC}"
echo -e "${BLUE}📊 RESULTADO${NC}"
echo -e "${GREEN}✅ Passou: $PASSED/$TOTAL${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}❌ Falhou: $FAILED${NC}"
fi
if [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Avisos: $WARNINGS${NC}"
fi

# ============================================
# RECOMENDAÇÃO
# ============================================
if [ $FAILED -eq 0 ]; then
  echo -e "\n${GREEN}✅ PRONTO PARA DEPLOY!${NC}"
  echo -e "Execute: ${BLUE}./scripts/deploy-validated.sh${NC}"
  exit 0
else
  echo -e "\n${RED}❌ ERROS ENCONTRADOS${NC}"
  echo -e "Resolva os problemas acima antes de fazer deploy"
  exit 1
fi
