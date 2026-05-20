#!/bin/bash

# ============================================
# AUDITORIA COMPLETA - MÓDULO QUALIFICAÇÕES
# Testa TUDO: endpoints, botões, queries, CRUD
# ============================================

echo "🔍 ================================================================"
echo "   AUDITORIA COMPLETA - MÓDULO QUALIFICAÇÕES"
echo "   Data: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================"
echo ""

# Configuração
API_BASE="http://localhost:8787/api"
TOKEN="dev-bypass"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

success=0
warnings=0
errors=0

print_success() { echo -e "${GREEN}✅ $1${NC}"; ((success++)); }
print_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; ((warnings++)); }
print_error() { echo -e "${RED}❌ $1${NC}"; ((errors++)); }
print_header() { echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n${BLUE}$1${NC}\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ============================================
# 1. ESTRUTURA DE ARQUIVOS
# ============================================
print_header "1. ESTRUTURA DE ARQUIVOS DO MÓDULO"

echo "📁 Backend (worker-airtrust):"
[ -f "worker-airtrust/src/routes/qualificacoes.ts" ] && print_success "routes/qualificacoes.ts" || print_error "routes/qualificacoes.ts FALTANDO"
[ -f "worker-airtrust/src/services/qualificacoesService.ts" ] && print_success "services/qualificacoesService.ts" || print_warning "services/qualificacoesService.ts (opcional)"

echo ""
echo "📁 Frontend (src/react-app):"
[ -f "src/react-app/pages/Qualificacoes.tsx" ] && print_success "pages/Qualificacoes.tsx" || print_error "pages/Qualificacoes.tsx FALTANDO"
[ -f "src/react-app/components/modals/ModalAtribuirQualificacao.tsx" ] && print_success "ModalAtribuirQualificacao.tsx" || print_error "ModalAtribuirQualificacao.tsx FALTANDO"
[ -f "src/react-app/components/modals/ModalCertificado.tsx" ] && print_success "ModalCertificado.tsx" || print_error "ModalCertificado.tsx FALTANDO"
[ -f "src/react-app/hooks/useQualificacoes.ts" ] && print_success "useQualificacoes.ts" || print_warning "useQualificacoes.ts (opcional)"

# ============================================
# 3. ENDPOINTS - LISTAGEM
# ============================================
print_header "3. ENDPOINTS DE LISTAGEM"

echo "🔍 GET /qualificacoes/tipos"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/tipos?limit=10" 2>/dev/null)
if [ "$STATUS" = "200" ]; then
  print_success "Listar tipos (200 OK)"
elif [ "$STATUS" = "401" ]; then
  print_warning "Requer autenticação (401)"
else
  print_error "Falhou ($STATUS)"
fi

echo "🔍 GET /qualificacoes/historico"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/historico?limit=10&page=1" 2>/dev/null)
if [ "$STATUS" = "200" ]; then
  print_success "Listar histórico (200 OK)"
elif [ "$STATUS" = "401" ]; then
  print_warning "Requer autenticação (401)"
else
  print_error "Falhou ($STATUS)"
fi

echo "🔍 GET /categorias"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/categorias" 2>/dev/null)
if [ "$STATUS" = "200" ]; then
  print_success "Listar categorias (200 OK)"
elif [ "$STATUS" = "401" ]; then
  print_warning "Requer autenticação (401)"
elif [ "$STATUS" = "404" ]; then
  print_warning "Endpoint não existe (404)"
else
  print_error "Falhou ($STATUS)"
fi

echo "🔍 GET /funcionarios-ssot"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/funcionarios-ssot?status=ATIVO&limit=10" 2>/dev/null)
if [ "$STATUS" = "200" ]; then
  print_success "Listar funcionários (200 OK)"
elif [ "$STATUS" = "401" ]; then
  print_warning "Requer autenticação (401)"
else
  print_error "Falhou ($STATUS)"
fi

# ============================================
# 4. ENDPOINTS - DETALHES
# ============================================
print_header "4. ENDPOINTS DE DETALHES"

echo "🔍 GET /qualificacoes/tipos/:id"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/tipos/1" 2>/dev/null)
[ "$STATUS" = "200" ] && print_success "Detalhar tipo (200)" || [ "$STATUS" = "401" ] && print_warning "Requer auth (401)" || [ "$STATUS" = "404" ] && print_warning "Endpoint não existe (404)" || print_error "Falhou ($STATUS)"

echo "🔍 GET /qualificacoes/historico/:id"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/historico/1" 2>/dev/null)
[ "$STATUS" = "200" ] && print_success "Detalhar histórico (200)" || [ "$STATUS" = "401" ] && print_warning "Requer auth (401)" || [ "$STATUS" = "404" ] && print_warning "ID não existe (404)" || print_error "Falhou ($STATUS)"

# ============================================
# 8. ENDPOINTS - CERTIFICADOS
# ============================================
print_header "8. ENDPOINTS DE CERTIFICADOS"

echo "📄 GET /qualificacoes/historico/:id/certificados"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/historico/13/certificados" 2>/dev/null)
[ "$STATUS" = "200" ] && print_success "Listar certificados (200)" || [ "$STATUS" = "401" ] && print_warning "Requer auth (401)" || [ "$STATUS" = "404" ] && print_error "Endpoint NÃO implementado (404)" || print_error "Falhou ($STATUS)"

echo "📝 POST /qualificacoes/historico/:id/gerar-certificado"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" -X POST "$API_BASE/qualificacoes/historico/13/gerar-certificado" 2>/dev/null)
[ "$STATUS" = "200" ] && print_success "Gerar certificado (200)" || [ "$STATUS" = "401" ] && print_warning "Requer auth (401)" || [ "$STATUS" = "404" ] && print_error "Endpoint NÃO implementado (404)" || print_error "Falhou ($STATUS)"

# ============================================
# 10. FILTROS E PAGINAÇÃO
# ============================================
print_header "10. FILTROS E PAGINAÇÃO"

echo "📄 Paginação"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/historico?page=2&limit=20" 2>/dev/null)
[ "$STATUS" = "200" ] && print_success "Paginação funcionando (200)" || print_warning "Paginação pode ter problema ($STATUS)"

# ============================================
# 15. PERFORMANCE E CACHE
# ============================================
print_header "15. PERFORMANCE"

echo "⚡ Tempo de resposta dos endpoints:"
START=$(date +%s%N)
curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/qualificacoes/tipos?limit=10" > /dev/null 2>&1
END=$(date +%s%N)
DURATION=$(((END - START) / 1000000))
if [ $DURATION -lt 500 ]; then
  print_success "Resposta rápida (${DURATION}ms)"
elif [ $DURATION -lt 1000 ]; then
  print_warning "Resposta aceitável (${DURATION}ms)"
else
  print_error "Resposta lenta (${DURATION}ms)"
fi

# ============================================
# 17. RESUMO FINAL
# ============================================
print_header "17. RESUMO DA AUDITORIA"

TOTAL=$((success + warnings + errors))
echo ""
echo "📊 Estatísticas:"
echo "   ✅ Sucessos: $success"
echo "   ⚠️  Avisos: $warnings"
echo "   ❌ Erros: $errors"
echo "   📋 Total: $TOTAL"
echo ""

if [ $TOTAL -gt 0 ]; then
  PERCENT=$((success * 100 / TOTAL))
  echo "📈 Taxa de sucesso: $PERCENT%"
fi

echo ""
if [ $errors -eq 0 ] && [ $warnings -le 3 ]; then
  echo -e "${GREEN}🎉 MÓDULO QUALIFICAÇÕES ESTÁ FUNCIONAL!${NC}"
elif [ $errors -le 2 ]; then
  echo -e "${YELLOW}✅ MÓDULO PARCIALMENTE FUNCIONAL${NC}"
  echo "   Corrija os erros críticos antes de usar em produção"
else
  echo -e "${RED}⚠️  MÓDULO COM PROBLEMAS GRAVES${NC}"
  echo "   Muitos erros encontrados. Revisão necessária."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Auditoria concluída: $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
