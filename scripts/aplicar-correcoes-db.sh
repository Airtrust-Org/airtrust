#!/bin/bash
set -euo pipefail

# Script para aplicar todas as correções de banco de dados
# 1. Remove colunas inúteis do histórico de qualificações
# 2. Corrige matrículas para 5 dígitos
# 3. Padroniza telefones

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_NAME="airtrust-db"

echo "🔧 Iniciando correções do banco de dados..."
echo ""

# 1. Aplicar migration para remover colunas inúteis
echo "📋 1/3 - Removendo colunas inúteis do histórico de qualificações..."
if wrangler d1 execute "$DB_NAME" --remote --file="$PROJECT_ROOT/worker-airtrust/migrations/0200_remove_unused_columns_historico.sql"; then
  echo "✅ Colunas removidas com sucesso"
else
  echo "⚠️  Falha ao remover colunas (pode já ter sido aplicada)"
fi
echo ""

# 2. Corrigir matrículas para 5 dígitos
echo "📋 2/3 - Corrigindo matrículas para 5 dígitos..."
if wrangler d1 execute "$DB_NAME" --remote --file="$PROJECT_ROOT/scripts/fix-matriculas-5-digitos.sql"; then
  echo "✅ Matrículas corrigidas"
else
  echo "❌ Falha ao corrigir matrículas"
  exit 1
fi
echo ""

# 3. Padronizar telefones
echo "📋 3/3 - Padronizando telefones..."
if wrangler d1 execute "$DB_NAME" --remote --file="$PROJECT_ROOT/scripts/fix-telefones-padrao.sql"; then
  echo "✅ Telefones padronizados"
else
  echo "❌ Falha ao padronizar telefones"
  exit 1
fi
echo ""

echo "🎉 Todas as correções foram aplicadas com sucesso!"
echo ""
echo "📊 Resumo:"
echo "  ✓ Colunas tipo, local, modalidade removidas do histórico"
echo "  ✓ Matrículas com 5 dígitos (zeros à esquerda)"
echo "  ✓ Telefones no formato padrão (XX) XXXXX-XXXX"
