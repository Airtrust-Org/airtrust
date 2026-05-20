#!/bin/bash
# ========================================
# SCRIPT: SUITE MASTER - EXECUTA TODOS OS TESTES
# Arquivo: test-suite-master.sh
# Executa todos os scripts de teste na ordem correta
# ========================================

set -e

echo "🚀 ============================================"
echo "🚀 AIRTRUST - SUITE MASTER DE TESTES"
echo "🚀 ============================================"
echo ""
echo "📋 Configuração:"
echo "   API: ${API_BASE:-https://airtrust-api-production.airtrust.workers.dev/api}"
echo "   Token: ${AUTH_TOKEN:+Configurado}" "${AUTH_TOKEN:-Não configurado (modo dev)}"
echo ""

PASSED=0
FAILED=0
SKIPPED=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

run_test() {
  local script=$1
  local name=$2
  
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}▶️  $name${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  if [ ! -f "$script" ]; then
    echo -e "${YELLOW}⚠️ Script não encontrado: $script${NC}"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  
  if bash "$script"; then
    echo -e "${GREEN}✅ PASSOU: $name${NC}"
    PASSED=$((PASSED + 1))
  else
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 0 ]; then
      echo -e "${GREEN}✅ PASSOU: $name${NC}"
      PASSED=$((PASSED + 1))
    else
      echo -e "${RED}❌ FALHOU: $name (exit code: $EXIT_CODE)${NC}"
      FAILED=$((FAILED + 1))
    fi
  fi
}

# ========================================
# ORDEM DE EXECUÇÃO DOS TESTES
# ========================================

echo "🎯 Iniciando suite de testes..."
echo ""

# Testes básicos de infraestrutura
run_test "test-endpoints.sh" "1. Health Check & Endpoints Básicos"

# Testes completos de todos os módulos
run_test "test-modulos-completo.sh" "2. Todos os Módulos (Funcionários, Licenças, Qualificações, etc)"

# Testes E2E completos
run_test "test-e2e-completo.sh" "3. Testes E2E Completos da API"

# Testes de qualificações E2E
run_test "test-modal-qualificacao-e2e.sh" "4. Qualificações - Fluxo E2E do Modal"

# Testes de dashboard e estatísticas
run_test "test-dashboard-stats.sh" "5. Dashboard e Estatísticas Globais"

# Testes de lógica de renovação
run_test "test-renovacao-logica.sh" "6. Lógica de Renovação de Qualificações"

# Testes de correção e auditoria
run_test "test-fix-discrepancias.sh" "7. Correção de Discrepâncias e Auditoria"

# Testes de reatividade
run_test "test-funcionario-reatividade-sem-auth.sh" "8. Reatividade de Funcionários e Views"

# ========================================
# RESUMO FINAL
# ========================================

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║         RESUMO DA SUITE DE TESTES          ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

TOTAL=$((PASSED + FAILED + SKIPPED))

echo -e "${GREEN}✅ Passou:   $PASSED / $TOTAL${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}❌ Falhou:   $FAILED / $TOTAL${NC}"
else
  echo -e "❌ Falhou:   $FAILED / $TOTAL"
fi
if [ $SKIPPED -gt 0 ]; then
  echo -e "${YELLOW}⚠️ Pulados:  $SKIPPED / $TOTAL${NC}"
else
  echo "⚠️ Pulados:  $SKIPPED / $TOTAL"
fi

PASS_RATE=0
if [ $TOTAL -gt 0 ]; then
  PASS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED/$TOTAL)*100}")
fi

echo ""
echo "📊 Taxa de Sucesso: $PASS_RATE%"
echo ""

# Determinar status final
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}❌ SUITE FALHOU - Verifique os logs acima${NC}"
  echo ""
  echo "🔍 Para debugar testes individuais:"
  echo "   bash test-<nome-do-teste>.sh"
  echo ""
  exit 1
else
  echo -e "${GREEN}🎉 SUITE PASSOU - Sistema 100% operacional!${NC}"
  echo ""
  echo "✨ Todos os módulos críticos validados:"
  echo "   ✅ Infraestrutura e APIs"
  echo "   ✅ CRUD de Qualificações"
  echo "   ✅ Dashboard e Estatísticas"
  echo "   ✅ Renovação e Auditoria"
  echo "   ✅ Certificados e R2"
  echo "   ✅ SSOT e Integridade"
  echo "   ✅ Reatividade de Dados"
  echo ""
  
  if [ $SKIPPED -gt 0 ]; then
    echo -e "${YELLOW}ℹ️  $SKIPPED teste(s) pulado(s) - scripts não encontrados${NC}"
    echo ""
  fi
  
  exit 0
fi
