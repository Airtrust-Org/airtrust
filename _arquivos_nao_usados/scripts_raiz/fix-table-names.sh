#!/bin/bash
set -e

echo "🔧 CORRIGINDO TODOS OS CONFLITOS DE NOMES DE TABELAS"
echo "===================================================="

# 1. certificacoesv3 → qualificacoes_historico (é a tabela correta para certificações de funcionários)
echo "📝 1. Corrigindo certificacoesv3..."
find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's/certificacoesv3/qualificacoes_historico/g' \
  -e 's/certificacoes_v3/qualificacoes_historico/g' \
  -e 's/certificacoesV3/qualificacoesHistorico/g' \
  {} +

# 2. fichas_manobras_executadas → fichas_manobras_historico
echo "📝 2. Corrigindo fichas_manobras_executadas..."
find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's/fichas_manobras_executadas/fichas_manobras_historico/g' \
  {} +

# 3. FROM qualificacoes WHERE (sem _tipos ou _historico) → qualificacoes_tipos
echo "📝 3. Corrigindo FROM qualificacoes WHERE..."
find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's/FROM qualificacoes WHERE/FROM qualificacoes_tipos WHERE/g' \
  -e 's/FROM qualificacoes$/FROM qualificacoes_tipos/g' \
  {} +

# 4. Corrigir categorias_qualificacoes → qualificacoes_categorias
echo "📝 4. Corrigindo categorias_qualificacoes..."
find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's/categorias_qualificacoes/qualificacoes_categorias/g' \
  {} +

# 5. Corrigir manobras_catalogo → manobras
echo "📝 5. Corrigindo manobras_catalogo..."
find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's/manobras_catalogo/manobras/g' \
  {} +

# 6. Corrigir pasta_virtual_arquivos → pasta_virtual
echo "📝 6. Corrigindo pasta_virtual_arquivos..."
find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's/pasta_virtual_arquivos/pasta_virtual/g' \
  {} +

echo ""
echo "✅ CORREÇÕES APLICADAS!"
echo ""
echo "📋 Próximos passos:"
echo "  1. Revisar arquivos modificados"
echo "  2. npx tsc --noEmit (verificar erros)"
echo "  3. npm run build"
echo "  4. Testar localmente"
echo "  5. git commit + deploy"
