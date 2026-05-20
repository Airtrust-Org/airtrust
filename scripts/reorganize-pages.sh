#!/bin/bash
# reorganize-pages.sh
# Cria estrutura target para reorganização do módulo simuladores

set -euo pipefail

echo "🏗️  REORGANIZANDO ESTRUTURA DE PÁGINAS - MÓDULO SIMULADORES"
echo ""

# Base path
BASE="src/react-app/pages/simuladores"

# 1. Criar estrutura target
echo "📁 Criando estrutura de pastas target..."

mkdir -p "$BASE/dashboard/components"
mkdir -p "$BASE/cadastros/simuladores/[id]"
mkdir -p "$BASE/cadastros/manobras"
mkdir -p "$BASE/cadastros/templates"
mkdir -p "$BASE/sessoes/[id]"
mkdir -p "$BASE/fichas/[id]"
mkdir -p "$BASE/relatorios"
mkdir -p "$BASE/components"

echo "✅ Estrutura de pastas criada:"
tree -L 3 "$BASE" -d 2>/dev/null || find "$BASE" -type d | sort

echo ""
echo "📋 ARQUIVOS ATUAIS (na raiz) PARA MIGRAR:"
find "$BASE" -maxdepth 1 -name "*.tsx" -type f | sort | while read file; do
  basename "$file"
done

echo ""
echo "📊 ESTATÍSTICAS ATUAIS:"
echo "   Arquivos na raiz: $(find "$BASE" -maxdepth 1 -name "*.tsx" -type f | wc -l | tr -d ' ')"
echo "   Total de páginas: $(find "$BASE" -name "*.tsx" -type f | wc -l | tr -d ' ')"

echo ""
echo "📝 PRÓXIMO PASSO:"
echo "   1. Preencher _migration/mapping.md com destino de cada arquivo"
echo "   2. Usar ./scripts/migrate-file.sh para mover arquivos"
echo "   3. Atualizar imports e rotas"
echo ""
echo "✅ Estrutura target pronta!"
