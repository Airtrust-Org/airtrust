#!/bin/bash
# atualizar-imports-app.sh
# Atualiza imports no App.tsx para novos caminhos

set -euo pipefail

echo "🔧 ATUALIZANDO IMPORTS NO APP.TSX..."

APP_FILE="src/react-app/App.tsx"

# Backup
cp "$APP_FILE" "${APP_FILE}.bak"

# Atualizar imports um por um
sed -i '' \
  -e "s|'./pages/simuladores/FichasSessao'|'./pages/simuladores/fichas'|g" \
  -e "s|'./pages/simuladores/FichaDetalhe'|'./pages/simuladores/fichas/[id]'|g" \
  -e "s|'./pages/simuladores/NovaSessao'|'./pages/simuladores/sessoes/nova'|g" \
  -e "s|'./pages/simuladores/AgendaCalendario'|'./pages/simuladores/agenda'|g" \
  -e "s|'./pages/simuladores/CrudSimuladores'|'./pages/simuladores/cadastros/simuladores/crud-completo'|g" \
  -e "s|'./pages/simuladores/CrudManobras'|'./pages/simuladores/cadastros/manobras'|g" \
  -e "s|'./pages/simuladores/CrudModelos'|'./pages/simuladores/cadastros/modelos'|g" \
  -e "s|'./pages/simuladores/CrudCategorias'|'./pages/simuladores/cadastros/categorias'|g" \
  -e "s|'./pages/simuladores/CrudTiposSessao'|'./pages/simuladores/cadastros/tipos-sessao'|g" \
  -e "s|'./pages/simuladores/CrudInstrutores'|'./pages/simuladores/cadastros/instrutores'|g" \
  -e "s|'./pages/simuladores/CrudTemplates'|'./pages/simuladores/cadastros/templates'|g" \
  -e "s|'./pages/simuladores/RelatoriosSimuladores'|'./pages/simuladores/relatorios'|g" \
  -e "s|'./pages/simuladores/ConfiguracoesCadastros'|'./pages/simuladores/cadastros/configuracoes'|g" \
  "$APP_FILE"

echo "✅ Imports atualizados!"
echo "💾 Backup salvo em: ${APP_FILE}.bak"

# Mostrar diferenças
echo ""
echo "📝 MUDANÇAS:"
diff "${APP_FILE}.bak" "$APP_FILE" || true

echo ""
echo "🏗️  Testando build..."
npm run build > /tmp/build-pos-imports.log 2>&1 && echo "✅ Build OK!" || echo "❌ Build falhou (ver /tmp/build-pos-imports.log)"
