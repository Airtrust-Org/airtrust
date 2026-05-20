#!/bin/bash
set -e

echo "🔧 CORREÇÃO FINAL - TABELAS INEXISTENTES"
echo "=========================================="

# 1. checks → qualificacoes_historico (com tipo='CHECK')
echo "📝 1. Corrigindo checks..."
find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's/DELETE FROM checks WHERE/DELETE FROM qualificacoes_historico WHERE tipo = '\''CHECK'\'' AND/g' \
  -e 's/FROM checks WHERE/FROM qualificacoes_historico WHERE tipo = '\''CHECK'\'' AND/g' \
  {} +

# 2. exames → qualificacoes_historico (com tipo='EXAME')
echo "📝 2. Corrigindo exames..."
find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's/DELETE FROM exames WHERE/DELETE FROM qualificacoes_historico WHERE tipo = '\''EXAME'\'' AND/g' \
  -e 's/FROM exames e$/FROM qualificacoes_historico e WHERE e.tipo = '\''EXAME'\''/g' \
  {} +

# 3. auditlogs → auditoria
echo "📝 3. Corrigindo auditlogs..."
find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's/INTO auditlogs (/INTO auditoria (/g' \
  -e 's/FROM auditlogs/FROM auditoria/g' \
  {} +

# 4. avaliacoes_manobras → manobras_avaliacoes (nome correto no banco)
echo "📝 4. Corrigindo avaliacoes_manobras..."
find src/worker -type f -name "*.ts" -exec sed -i '' \
  -e 's/avaliacoes_manobras/manobras_avaliacoes/g' \
  {} +

echo ""
echo "✅ CORREÇÕES APLICADAS!"
echo ""
echo "Resumo:"
echo "  - checks → qualificacoes_historico (tipo='CHECK')"
echo "  - exames → qualificacoes_historico (tipo='EXAME')"
echo "  - auditlogs → auditoria"
echo "  - avaliacoes_manobras → manobras_avaliacoes"
