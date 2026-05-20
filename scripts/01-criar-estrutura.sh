#!/bin/bash
# 01-criar-estrutura.sh
# Cria estrutura feature-based target

set -euo pipefail

echo "🏗️  CRIANDO ESTRUTURA TARGET..."

# Estrutura conforme ARQUITETURA_SIMULADORES.md
BASE="src/react-app/pages/simuladores"

# Dashboard
mkdir -p "$BASE/dashboard/components"

# Cadastros
mkdir -p "$BASE/cadastros/simuladores/components"
mkdir -p "$BASE/cadastros/simuladores/[id]"
mkdir -p "$BASE/cadastros/manobras/components"
mkdir -p "$BASE/cadastros/templates/components"

# Sessões
mkdir -p "$BASE/sessoes/components"
mkdir -p "$BASE/sessoes/[id]"

# Fichas
mkdir -p "$BASE/fichas/components"
mkdir -p "$BASE/fichas/[id]"

# Relatórios
mkdir -p "$BASE/relatorios/components"

# Componentes shared
mkdir -p "$BASE/components"

echo "✅ Estrutura de pastas criada!"

# Criar .gitkeep para garantir pastas vazias
find "$BASE" -type d -empty -exec touch {}/.gitkeep \; 2>/dev/null || true

# Visualizar estrutura
echo ""
echo "📁 ESTRUTURA CRIADA:"
if command -v tree &> /dev/null; then
  tree "$BASE" -L 3 -I "*.tsx" 2>/dev/null || find "$BASE" -type d | sort
else
  find "$BASE" -type d | sort
fi

# Log
echo "$(date): Estrutura criada" >> _migration/logs/timeline.log

echo ""
echo "✅ Estrutura target pronta!"
