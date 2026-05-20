#!/bin/bash

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🔍 AUDITORIA COMPLETA DE ENDPOINTS DO SISTEMA"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "🌐 API Base: $API_URL"
echo "⏰ Início: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Contadores
TOTAL=0
OK=0
ERRO=0
AVISO=0

# Função para testar endpoint
testar_endpoint() {
  local metodo=$1
  local endpoint=$2
  local descricao=$3
  local esperado=${4:-200}
  
  TOTAL=$((TOTAL + 1))
  
  # Fazer requisição
  if [ "$metodo" == "GET" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL$endpoint")
  else
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X "$metodo" "$API_URL$endpoint")
  fi
  
  # Verificar resultado
  if [ "$HTTP_CODE" == "$esperado" ]; then
    echo -e "${GREEN}✅${NC} $metodo $endpoint - $descricao (${HTTP_CODE})"
    OK=$((OK + 1))
  elif [ "$HTTP_CODE" == "404" ]; then
    echo -e "${RED}❌ 404${NC} $metodo $endpoint - $descricao ${RED}(ENDPOINT NÃO EXISTE)${NC}"
    ERRO=$((ERRO + 1))
  elif [ "$HTTP_CODE" == "500" ]; then
    echo -e "${RED}❌ 500${NC} $metodo $endpoint - $descricao ${RED}(ERRO INTERNO)${NC}"
    ERRO=$((ERRO + 1))
  else
    echo -e "${YELLOW}⚠️  ${HTTP_CODE}${NC} $metodo $endpoint - $descricao"
    AVISO=$((AVISO + 1))
  fi
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 SISTEMA & SAÚDE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/health" "Health check"
testar_endpoint "GET" "/api/v2/health" "Health check v2"
testar_endpoint "GET" "/api/v2/sistema/info" "Informações do sistema"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "👥 FUNCIONÁRIOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/funcionarios" "Listar funcionários"
testar_endpoint "GET" "/api/v2/funcionarios/1" "Buscar funcionário por ID"
testar_endpoint "GET" "/api/v2/funcionarios/search?q=teste" "Buscar funcionários"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📜 QUALIFICAÇÕES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/qualificacoes" "Listar qualificações"
testar_endpoint "GET" "/api/v2/qualificacoes/1" "Buscar qualificação por ID"
testar_endpoint "GET" "/api/v2/qualificacoes/funcionario/1" "Qualificações por funcionário"
testar_endpoint "GET" "/api/v2/categorias-qualificacoes" "Categorias de qualificações"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 EXAMES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/exames" "Listar exames"
testar_endpoint "GET" "/api/v2/exames/1" "Buscar exame por ID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ CHECKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/checks" "Listar checks"
testar_endpoint "GET" "/api/v2/checks/1" "Buscar check por ID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎓 TREINAMENTOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/treinamentos" "Listar treinamentos"
testar_endpoint "GET" "/api/v2/treinamentos/1" "Buscar treinamento por ID"
testar_endpoint "GET" "/api/v2/catalogo-treinamentos" "Catálogo de treinamentos"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎮 SIMULADORES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/simuladores" "Listar simuladores"
testar_endpoint "GET" "/api/v2/simuladores/1" "Buscar simulador por ID"
testar_endpoint "GET" "/api/v2/simuladores-consolidado" "Simuladores consolidado"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 MANOBRAS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/manobras" "Listar manobras"
testar_endpoint "GET" "/api/v2/manobras/1" "Buscar manobra por ID"
testar_endpoint "GET" "/api/v2/simuladores-consolidado/categorias" "Categorias de manobras"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 MODELOS DE SESSÃO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/simuladores/modelos" "Listar modelos"
testar_endpoint "GET" "/api/v2/simuladores/modelos/1" "Buscar modelo por ID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📅 AGENDAMENTOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/agendamentos" "Listar agendamentos"
testar_endpoint "GET" "/api/v2/agendamentos/1" "Buscar agendamento por ID"
testar_endpoint "GET" "/api/v2/simulador/slots?data=2025-12-22&simulador_id=1" "Slots disponíveis"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📄 FICHAS DE SESSÃO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/fichas" "Listar fichas" "400"
testar_endpoint "GET" "/api/v2/fichas/0b055562-212d-4ce8-b829-51015f146798" "Buscar ficha por UUID"
testar_endpoint "GET" "/api/v2/fichas/0b055562-212d-4ce8-b829-51015f146798/pdf" "Gerar PDF da ficha"
testar_endpoint "GET" "/api/v2/simulador/ficha/0b055562-212d-4ce8-b829-51015f146798" "Buscar ficha (alias)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 DASHBOARD & RELATÓRIOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/dashboard" "Dashboard geral"
testar_endpoint "GET" "/api/v2/dashboard-stats" "Estatísticas do dashboard"
testar_endpoint "GET" "/api/v2/compliance/dashboard" "Dashboard de compliance"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🏢 ESTRUTURA ORGANIZACIONAL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/empresas" "Listar empresas"
testar_endpoint "GET" "/api/v2/setores" "Listar setores"
testar_endpoint "GET" "/api/v2/funcoes" "Listar funções"
testar_endpoint "GET" "/api/v2/aeronaves" "Listar aeronaves"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 CERTIFICADOS & STORAGE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/certificados" "Listar certificados" "400"
testar_endpoint "GET" "/api/v2/certificados-storage" "Storage de certificados" "400"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔔 ALERTAS & NOTIFICAÇÕES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/alertas" "Listar alertas"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 AUDITORIA & LOGS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
testar_endpoint "GET" "/api/v2/auditoria" "Logs de auditoria" "400"
testar_endpoint "GET" "/api/v2/importacoes" "Logs de importações"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "📊 RESUMO DA AUDITORIA"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo -e "Total de endpoints testados: ${BLUE}$TOTAL${NC}"
echo -e "✅ Funcionando corretamente: ${GREEN}$OK${NC} ($(awk "BEGIN {printf \"%.1f\", ($OK/$TOTAL)*100}")%)"
echo -e "❌ Com erro (404/500): ${RED}$ERRO${NC} ($(awk "BEGIN {printf \"%.1f\", ($ERRO/$TOTAL)*100}")%)"
echo -e "⚠️  Com aviso (outros códigos): ${YELLOW}$AVISO${NC} ($(awk "BEGIN {printf \"%.1f\", ($AVISO/$TOTAL)*100}")%)"
echo ""
echo "⏰ Fim: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

if [ $ERRO -gt 0 ]; then
  echo -e "${RED}⚠️  ATENÇÃO: $ERRO endpoint(s) com erro crítico!${NC}"
  echo ""
fi

if [ $AVISO -gt 0 ]; then
  echo -e "${YELLOW}ℹ️  AVISO: $AVISO endpoint(s) com comportamento inesperado${NC}"
  echo ""
fi

if [ $ERRO -eq 0 ] && [ $AVISO -eq 0 ]; then
  echo -e "${GREEN}🎉 Todos os endpoints estão funcionando corretamente!${NC}"
  echo ""
fi
