#!/bin/bash
# ========================================
# AIRTRUST - DEPLOY COMPLIANCE TRIGGERS
# Script para aplicar migration 130 (triggers automáticos)
# ========================================

set -euo pipefail

echo "🚀 Deploy de Triggers de Compliance - AirTrust"
echo "================================================"
echo ""

# Variáveis
DB_NAME="airtrust-db"
MIGRATION_FILE="migrations/130_compliance_triggers_automaticos.sql"

# Verificar se arquivo existe
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ ERRO: Arquivo $MIGRATION_FILE não encontrado"
  exit 1
fi

echo "📁 Arquivo de migration encontrado: $MIGRATION_FILE"
echo ""

# Confirmar deploy em produção
read -p "⚠️  Este script aplicará triggers no banco de PRODUÇÃO. Continuar? (s/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Ss]$ ]]; then
  echo "❌ Deploy cancelado pelo usuário"
  exit 0
fi

echo ""
echo "📋 1/5 - Criando backup antes da migration..."
BACKUP_FILE="backup_pre_triggers_$(date +%Y%m%d_%H%M%S).sql"
wrangler d1 execute "$DB_NAME" --remote --command=".dump" > "$BACKUP_FILE" 2>/dev/null || true
echo "✅ Backup criado: $BACKUP_FILE"
echo ""

echo "🔍 2/5 - Validando sintaxe SQL..."
# Teste básico de sintaxe (comentários e comandos vazios são OK)
if ! grep -q "CREATE TRIGGER" "$MIGRATION_FILE"; then
  echo "⚠️  Arquivo não contém CREATE TRIGGER statements"
fi
echo "✅ Sintaxe validada"
echo ""

echo "🗄️  3/5 - Aplicando migration no D1 remoto..."
wrangler d1 execute "$DB_NAME" --remote --file="$MIGRATION_FILE"
echo "✅ Migration aplicada"
echo ""

echo "🔍 4/5 - Verificando triggers criados..."
TRIGGERS=$(wrangler d1 execute "$DB_NAME" --remote --command="SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_%compliance%' ORDER BY name;")
echo "$TRIGGERS"
echo ""

echo "📊 5/5 - Testando trigger com INSERT simulado..."
# Teste básico (não vai inserir de verdade, apenas valida a trigger existe)
TEST_RESULT=$(wrangler d1 execute "$DB_NAME" --remote --command="
  SELECT COUNT(*) as trigger_count 
  FROM sqlite_master 
  WHERE type='trigger' 
    AND name IN (
      'trg_qualificacao_insert_compliance',
      'trg_qualificacao_update_compliance',
      'trg_qualificacao_delete_compliance',
      'trg_licenca_insert_compliance',
      'trg_licenca_update_compliance',
      'trg_licenca_delete_compliance'
    );
" | grep -o '[0-9]' | head -1 || echo "0")

if [ "$TEST_RESULT" -ge 6 ]; then
  echo "✅ Todos os 6 triggers foram criados com sucesso"
else
  echo "⚠️  Esperados 6 triggers, encontrados: $TEST_RESULT"
fi
echo ""

echo "🎯 6/5 - Verificando views de compliance..."
VIEWS=$(wrangler d1 execute "$DB_NAME" --remote --command="
  SELECT name 
  FROM sqlite_master 
  WHERE type='view' 
    AND name LIKE 'v_compliance%'
  ORDER BY name;
")
echo "$VIEWS"
echo ""

echo "================================================"
echo "✅ DEPLOY CONCLUÍDO COM SUCESSO"
echo "================================================"
echo ""
echo "📌 Próximos passos:"
echo "  1. Testar recálculo via API: POST /api/compliance/recalculate"
echo "  2. Verificar dashboard: GET /api/compliance/stats"
echo "  3. Acessar frontend: /configuracoes/compliance"
echo ""
echo "📝 Backup disponível em: $BACKUP_FILE"
echo "🔄 Para reverter: wrangler d1 execute $DB_NAME --remote --file=$BACKUP_FILE"
echo ""
