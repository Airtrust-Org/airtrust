#!/bin/bash
# ========================================
# AIRTRUST - APLICAR COMPLIANCE TRIGGERS (SIMPLES)
# Execute este script após configurar permissões D1
# ========================================

set -euo pipefail

echo "🚀 Aplicação de Triggers de Compliance - AirTrust"
echo "=================================================="
echo ""

DB_NAME="airtrust-db"
MIGRATION_FILE="migrations/130_compliance_triggers_automaticos.sql"

# Verificar arquivo
if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ ERRO: $MIGRATION_FILE não encontrado"
  exit 1
fi

echo "📁 Migration encontrada: $MIGRATION_FILE"
echo ""

# Opção 1: Via wrangler (requer permissões D1)
echo "📋 OPÇÃO 1: Via Wrangler CLI"
echo "Comando:"
echo "  wrangler d1 execute $DB_NAME --remote --file=$MIGRATION_FILE"
echo ""

# Opção 2: Via Dashboard Cloudflare
echo "📋 OPÇÃO 2: Via Cloudflare Dashboard (Manual)"
echo "1. Acesse: https://dash.cloudflare.com/4dca4e5fddc6a351651dd224f456586f/workers-and-pages/d1"
echo "2. Selecione database: $DB_NAME"
echo "3. Clique em 'Console' tab"
echo "4. Cole o conteúdo de $MIGRATION_FILE"
echo "5. Clique em 'Execute'"
echo ""

# Opção 3: Via API Cloudflare
echo "📋 OPÇÃO 3: Via API Cloudflare"
echo "Endpoint:"
echo "  POST https://api.cloudflare.com/client/v4/accounts/4dca4e5fddc6a351651dd224f456586f/d1/database/$DB_NAME/query"
echo ""
echo "Headers:"
echo "  Authorization: Bearer <TOKEN_COM_PERMISSAO_D1>"
echo "  Content-Type: application/json"
echo ""
echo "Body:"
echo '  {"sql": "<CONTEUDO_SQL_AQUI>"}'
echo ""

# Mostrar SQL para copiar
echo "=================================================="
echo "📄 SQL PARA COPIAR (caso use opção 2 ou 3):"
echo "=================================================="
echo ""
cat "$MIGRATION_FILE"
echo ""
echo "=================================================="
echo ""

# Verificação após aplicação
echo "🔍 VERIFICAÇÃO PÓS-APLICAÇÃO"
echo "Execute este comando após aplicar a migration:"
echo ""
echo "wrangler d1 execute $DB_NAME --remote --command=\"SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_%compliance%';\""
echo ""
echo "Esperado: 6 triggers listados"
echo "  - trg_qualificacao_insert_compliance"
echo "  - trg_qualificacao_update_compliance"
echo "  - trg_qualificacao_delete_compliance"
echo "  - trg_licenca_insert_compliance"
echo "  - trg_licenca_update_compliance"
echo "  - trg_licenca_delete_compliance"
echo ""

echo "✅ Script concluído. Escolha uma das opções acima para aplicar."
