#!/bin/bash
# investigar-design-system.sh
# Script para analisar o Design System do AirTrust

echo "🔍 INVESTIGANDO DESIGN SYSTEM DO AIRTRUST..."
echo ""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "===== 1. TAILWIND CONFIG ====="
if [ -f "tailwind.config.js" ]; then
  echo -e "${GREEN}✅ tailwind.config.js encontrado${NC}"
  echo ""
  echo "Cores customizadas:"
  grep -A 30 "colors:" tailwind.config.js | head -30
elif [ -f "tailwind.config.ts" ]; then
  echo -e "${GREEN}✅ tailwind.config.ts encontrado${NC}"
  grep -A 30 "colors:" tailwind.config.ts | head -30
else
  echo -e "${RED}❌ Tailwind config não encontrado${NC}"
fi

echo ""
echo "===== 2. COMPONENTES UI ====="
echo "Componentes em src/react-app/components/UI/:"
if [ -d "src/react-app/components/UI" ]; then
  ls -1 src/react-app/components/UI/*.tsx 2>/dev/null | sed 's|.*/||' | sort
  echo ""
  echo "Total: $(ls -1 src/react-app/components/UI/*.tsx 2>/dev/null | wc -l) componentes"
else
  echo -e "${RED}❌ Pasta UI não encontrada${NC}"
fi

echo ""
echo "===== 3. EXPORTS DO DESIGN SYSTEM ====="
if [ -f "src/react-app/components/UI/index.ts" ]; then
  echo -e "${GREEN}✅ index.ts encontrado${NC}"
  echo ""
  echo "Componentes exportados:"
  grep "export.*from" src/react-app/components/UI/index.ts | head -20
else
  echo -e "${RED}❌ index.ts não encontrado${NC}"
fi

echo ""
echo "===== 4. PÁGINAS USANDO DESIGN SYSTEM ====="
echo ""
echo "Funcionários:"
grep -h "import.*from.*components/UI" src/react-app/pages/funcionarios/*.tsx 2>/dev/null | \
  sed 's/.*{\(.*\)}.*/\1/' | tr ',' '\n' | sed 's/^ *//' | sort -u | head -10
echo ""
echo "Qualificações:"
grep -h "import.*from.*components/UI" src/react-app/pages/qualificacoes/*.tsx 2>/dev/null | \
  sed 's/.*{\(.*\)}.*/\1/' | tr ',' '\n' | sed 's/^ *//' | sort -u | head -10
echo ""
echo "Simuladores:"
grep -h "import.*from.*components/UI" src/react-app/pages/simuladores/**/*.tsx 2>/dev/null | \
  sed 's/.*{\(.*\)}.*/\1/' | tr ',' '\n' | sed 's/^ *//' | sort -u | head -10

echo ""
echo "===== 5. LAYOUTS CUSTOMIZADOS ====="
echo "SimuladoresLayout:"
if [ -f "src/react-app/components/layout/SimuladoresLayout.tsx" ]; then
  echo -e "${YELLOW}⚠️  SimuladoresLayout existe (customizado)${NC}"
  echo "Usado em:"
  grep -r "SimuladoresLayout" src/react-app/pages/simuladores --include="*.tsx" 2>/dev/null | \
    wc -l | xargs echo "  arquivos"
else
  echo -e "${GREEN}✅ Não usa layout customizado${NC}"
fi

echo ""
echo "===== 6. PADRÕES COMUNS ====="
echo ""
echo "Classes Tailwind mais usadas em Funcionários:"
grep -ho 'className="[^"]*"' src/react-app/pages/funcionarios/*.tsx 2>/dev/null | \
  sed 's/className="//;s/"//' | tr ' ' '\n' | sort | uniq -c | sort -rn | head -10

echo ""
echo "===== 7. COMPONENTES SIMILARES ====="
echo ""
echo "PageHeader vs SimuladoresLayout:"
echo -n "  PageHeader usado: "
grep -r "PageHeader" src/react-app/pages --include="*.tsx" 2>/dev/null | wc -l
echo -n "  SimuladoresLayout usado: "
grep -r "SimuladoresLayout" src/react-app/pages --include="*.tsx" 2>/dev/null | wc -l

echo ""
echo "Tabs (Design System) vs Custom Tabs:"
echo -n "  Tabs (UI) usado: "
grep -r "from.*components/UI.*Tabs" src/react-app/pages --include="*.tsx" 2>/dev/null | wc -l
echo -n "  Tabs custom usado: "
grep -r "TabContainer\|CustomTabs" src/react-app/pages --include="*.tsx" 2>/dev/null | wc -l

echo ""
echo "===== 8. BIBLIOTECAS EXTERNAS ====="
echo ""
echo -n "shadcn/ui: "
if [ -f "components.json" ]; then
  echo -e "${GREEN}✅ Configurado${NC}"
else
  echo -e "${RED}❌ Não configurado${NC}"
fi

echo -n "Headless UI: "
if grep -q "@headlessui" package.json 2>/dev/null; then
  echo -e "${GREEN}✅ Instalado${NC}"
else
  echo -e "${RED}❌ Não instalado${NC}"
fi

echo -n "daisyUI: "
if grep -q "daisyui" tailwind.config.* 2>/dev/null; then
  echo -e "${GREEN}✅ Configurado${NC}"
else
  echo -e "${RED}❌ Não configurado${NC}"
fi

echo ""
echo "===== 9. CSS GLOBAL ====="
echo "Arquivos CSS encontrados:"
find src -name "*.css" -type f 2>/dev/null | head -10

echo ""
echo "===== 10. ESTRUTURA DE PÁGINAS ====="
echo ""
echo "Estrutura de Funcionários:"
ls -1 src/react-app/pages/funcionarios/*.tsx 2>/dev/null | wc -l | xargs echo "  arquivos TSX"

echo "Estrutura de Qualificações:"
ls -1 src/react-app/pages/qualificacoes/*.tsx 2>/dev/null | wc -l | xargs echo "  arquivos TSX"

echo "Estrutura de Simuladores:"
find src/react-app/pages/simuladores -name "*.tsx" -type f 2>/dev/null | wc -l | xargs echo "  arquivos TSX"

echo ""
echo "===== RESUMO ====="
echo ""
if [ -f "src/react-app/components/UI/index.ts" ]; then
  echo -e "${GREEN}✅ Design System completo encontrado em /components/UI/${NC}"
  echo ""
  echo "Componentes principais:"
  grep "export.*PageHeader\|export.*Tabs\|export.*Button\|export.*Card" src/react-app/components/UI/index.ts
else
  echo -e "${YELLOW}⚠️  Design System parcial ou inexistente${NC}"
fi

echo ""
if [ -f "src/react-app/pages/funcionarios/FuncionariosWrapper.tsx" ]; then
  echo -e "${GREEN}✅ Funcionários usa Design System moderno${NC}"
else
  echo -e "${YELLOW}⚠️  Funcionários com estrutura desconhecida${NC}"
fi

echo ""
if [ -f "src/react-app/components/layout/SimuladoresLayout.tsx" ]; then
  echo -e "${YELLOW}⚠️  Simuladores usa layout customizado${NC}"
  echo -e "   ${BLUE}Recomendação: Migrar para Design System padrão${NC}"
else
  echo -e "${GREEN}✅ Simuladores alinhado com padrão${NC}"
fi

echo ""
echo "✅ INVESTIGAÇÃO COMPLETA!"
echo ""
echo "Próximos passos:"
echo "1. Revisar DESIGN_SYSTEM_ANALYSIS.md"
echo "2. Decidir estratégia de migração"
echo "3. Executar migração de Simuladores"
