#!/bin/bash
# ================================================================
# Script: apply-migrations-fix-ids.sh
# Data: 2025-11-28
# Objetivo: Aplicar migrações 0125 e 0126 para corrigir IDs
# ================================================================

set -e

echo "🔧 Aplicando migração de correção de IDs..."
echo ""

# Navegar para diretório do worker
cd "$(dirname "$0")/worker-airtrust"

echo "📋 Migrações pendentes:"
echo "  - 0125_fix_qualificacoes_tipos_integer_ids.sql"
echo "  - 0126_recreate_view_with_integer_ids.sql"
echo ""

echo "⚠️  ATENÇÃO: Esta migração irá:"
echo "  1. Converter IDs de TEXT para INTEGER"
echo "  2. Preservar TODOS os dados existentes"
echo "  3. Manter backup em qualificacoes_tipos_backup_20251128"
echo "  4. Atualizar todas as referências em qualificacoes_historico"
echo ""

read -p "Deseja continuar? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "❌ Operação cancelada."
  exit 0
fi

echo ""
echo "🚀 Aplicando migrações..."
wrangler d1 migrations apply airtrust-db --remote

echo ""
echo "✅ Migrações aplicadas!"
echo ""
echo "📊 Próximos passos de validação:"
echo "  1. Verificar tipos: curl 'API/qualificacoes/tipos?limit=5' | jq '.data[0].id'"
echo "  2. Verificar histórico: curl 'API/qualificacoes/historico?limit=5' | jq '.data[0] | {tipo_nome, tipo_codigo}'"
echo "  3. Verificar contagens: curl 'API/qualificacoes/historico/stats'"
echo ""
echo "🎉 Correção de IDs concluída!"
