#!/bin/bash
# ================================================================
# APLICA MIGRATION 120: Triggers para Integração Ativa
# ================================================================

set -e

echo "🔄 MIGRATION 120: Triggers para Integração Ativa"
echo "================================================"
echo ""

DB="airtrust-db"
MIGRATION_FILE="migrations/120_triggers_integracao_ativa.sql"

# Verifica se arquivo existe
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Arquivo $MIGRATION_FILE não encontrado"
  exit 1
fi

echo "📋 Aplicando triggers..."

# Aplica migration
cd worker-airtrust

npx wrangler d1 execute "$DB" --file="../$MIGRATION_FILE"

echo ""
echo "✅ Migration 120 aplicada com sucesso!"
echo ""
echo "📊 Triggers criados:"
echo "   • recalcular_vencimentos_on_tipo_update"
echo "   • update_historico_timestamp"
echo ""
echo "🔗 Integração Ativa configurada:"
echo "   Quando tipos de qualificação forem atualizados,"
echo "   todos os vencimentos serão recalculados automaticamente!"
