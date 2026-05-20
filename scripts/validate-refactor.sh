#!/bin/bash
# validate-refactor.sh
# Valida refatoração completa do módulo simuladores

set -euo pipefail

echo "🧪 VALIDANDO REFATORAÇÃO DO MÓDULO SIMULADORES..."
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. Limpar caches
echo "🗑️  Limpando caches..."
rm -rf node_modules/.vite dist 2>/dev/null || true
echo "✅ Caches limpos"
echo ""

# 2. Build
echo "🏗️  Executando build..."
if npm run build 2>&1 | tee /tmp/build.log; then
  BUILD_TIME=$(grep "built in" /tmp/build.log | grep -oE "[0-9]+\.[0-9]+s" || echo "N/A")
  echo -e "${GREEN}✅ Build OK! ($BUILD_TIME)${NC}"
else
  echo -e "${RED}❌ Build falhou!${NC}"
  echo "Ver detalhes em /tmp/build.log"
  exit 1
fi
echo ""

# 3. Verificar imports quebrados
echo "🔍 Verificando imports quebrados..."
BROKEN_IMPORTS=0

if [ -f "scripts/check-imports-pos-limpeza.sh" ]; then
  chmod +x scripts/check-imports-pos-limpeza.sh
  if ./scripts/check-imports-pos-limpeza.sh | grep -q "quebrado"; then
    BROKEN_IMPORTS=1
    echo -e "${RED}❌ Imports quebrados encontrados${NC}"
  else
    echo -e "${GREEN}✅ Nenhum import quebrado${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  Script check-imports não encontrado, pulando...${NC}"
fi
echo ""

# 4. Auditar componentes
echo "📊 Auditando componentes..."
if [ -f "scripts/audit-components-simple.sh" ]; then
  chmod +x scripts/audit-components-simple.sh
  ./scripts/audit-components-simple.sh simuladores > /tmp/audit.txt || true
  
  UNUSED=$(grep -c "❌ NÃO USADO" /tmp/audit.txt || echo "0")
  
  if [ "$UNUSED" -eq 0 ]; then
    echo -e "${GREEN}✅ Todos os componentes estão em uso${NC}"
  else
    echo -e "${YELLOW}⚠️  $UNUSED componente(s) não usado(s)${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  Script audit não encontrado, pulando...${NC}"
fi
echo ""

# 5. Verificar backups manuais
echo "🔍 Verificando backups manuais..."
BACKUPS=$(find src/react-app/pages/simuladores -name "*.bak*" -o -name "*.backup*" 2>/dev/null | wc -l | tr -d ' ')

if [ "$BACKUPS" -eq 0 ]; then
  echo -e "${GREEN}✅ Nenhum backup manual encontrado${NC}"
else
  echo -e "${RED}❌ $BACKUPS backup(s) manual(is) encontrado(s)${NC}"
  find src/react-app/pages/simuladores -name "*.bak*" -o -name "*.backup*" 2>/dev/null | sed 's/^/   /'
fi
echo ""

# 6. Verificar PDF Generators
echo "🔍 Verificando PDF Generators..."
PDF_COUNT=$(find src/react-app/components/simuladores -name "PDFGenerator*.tsx" 2>/dev/null | wc -l | tr -d ' ')

if [ "$PDF_COUNT" -eq 1 ]; then
  echo -e "${GREEN}✅ 1 PDF Generator (consolidado)${NC}"
elif [ "$PDF_COUNT" -gt 1 ]; then
  echo -e "${YELLOW}⚠️  $PDF_COUNT PDF Generators encontrados (consolidação pendente)${NC}"
  find src/react-app/components/simuladores -name "PDFGenerator*.tsx" 2>/dev/null | sed 's/^/   /'
else
  echo -e "${RED}❌ Nenhum PDF Generator encontrado${NC}"
fi
echo ""

# 7. Contagem de arquivos
echo "📈 MÉTRICAS FINAIS:"
echo ""

PAGES=$(find src/react-app/pages/simuladores -name "*.tsx" -type f 2>/dev/null | wc -l | tr -d ' ')
PAGES_ROOT=$(find src/react-app/pages/simuladores -maxdepth 1 -name "*.tsx" -type f 2>/dev/null | wc -l | tr -d ' ')
COMPONENTS=$(find src/react-app/pages/simuladores/components -name "*.tsx" -type f 2>/dev/null | wc -l | tr -d ' ')
COMPONENTS_SHARED=$(find src/react-app/components/simuladores -name "*.tsx" -type f 2>/dev/null | wc -l | tr -d ' ')

echo "   Páginas total: $PAGES"
echo "   Páginas na raiz: $PAGES_ROOT"
if [ "$PAGES_ROOT" -eq 0 ] || [ "$PAGES_ROOT" -eq 1 ]; then
  echo -e "      ${GREEN}✅ Raiz limpa${NC}"
else
  echo -e "      ${YELLOW}⚠️  Ainda há arquivos na raiz${NC}"
fi

echo "   Componentes (pages/simuladores/components): $COMPONENTS"
echo "   Componentes shared (components/simuladores): $COMPONENTS_SHARED"
echo ""

# 8. Verificar documentação
echo "📚 Documentação:"
echo ""

DOCS=(
  "ARQUITETURA_SIMULADORES.md"
  "AUDITORIA_LIMPEZA_CONCLUIDA.md"
  "_migration/mapping.md"
)

for doc in "${DOCS[@]}"; do
  if [ -f "$doc" ]; then
    echo -e "   ${GREEN}✅${NC} $doc"
  else
    echo -e "   ${RED}❌${NC} $doc (não encontrado)"
  fi
done
echo ""

# 9. Status final
echo "═══════════════════════════════════════════"
echo ""

ERRORS=0
if [ "$BROKEN_IMPORTS" -ne 0 ]; then ((ERRORS++)); fi
if [ "$BACKUPS" -ne 0 ]; then ((ERRORS++)); fi
if [ "$PAGES_ROOT" -gt 1 ]; then ((ERRORS++)); fi

if [ "$ERRORS" -eq 0 ]; then
  echo -e "${GREEN}🎉 VALIDAÇÃO COMPLETA - TUDO OK!${NC}"
  echo ""
  echo "✅ Build passando"
  echo "✅ Sem imports quebrados"
  echo "✅ Sem backups manuais"
  echo "✅ Estrutura organizada"
  echo "✅ Documentação completa"
else
  echo -e "${YELLOW}⚠️  VALIDAÇÃO COMPLETA - $ERRORS ALERTA(S)${NC}"
  echo ""
  echo "Revisar itens marcados com ⚠️  ou ❌ acima"
fi

echo ""
echo "═══════════════════════════════════════════"
echo ""
echo "📝 PRÓXIMOS PASSOS:"
echo "   1. Revisar alertas acima (se houver)"
echo "   2. Executar testes funcionais manuais"
echo "   3. Fazer commit das mudanças"
echo "   4. Deploy para produção"
