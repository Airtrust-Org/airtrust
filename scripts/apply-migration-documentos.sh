#!/bin/bash
# ============================================================
# Script: Aplicar Migration Tabela Documentos (D1 Remote)
# Data: 2025-11-29
# ============================================================

set -e

echo "🗄️  Aplicando migration da tabela documentos no D1 produção..."

# Aplicar migration
wrangler d1 execute airtrust-db \
  --remote \
  --file=migrations/CREATE_TABLE_DOCUMENTOS_R2.sql

echo ""
echo "✅ Migration aplicada com sucesso!"
echo ""
echo "📊 Verificando criação da tabela..."

# Verificar se tabela foi criada
wrangler d1 execute airtrust-db \
  --remote \
  --command="SELECT name, sql FROM sqlite_master WHERE type='table' AND name='documentos'"

echo ""
echo "🎉 Tabela documentos configurada!"
