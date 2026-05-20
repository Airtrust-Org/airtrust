#!/bin/bash
# Script para aplicar migrations de refatoração de aeronaves
# Data: 2026-01-13

set -e

echo "🚀 Aplicando migrations de refatoração de aeronaves..."
echo ""

# Diretório base
BASE_DIR="/Users/filipedaumas/Documents/airtrust v1"
MIGRATIONS_DIR="$BASE_DIR/worker-airtrust/migrations"

# Verificar se as migrations existem
if [ ! -f "$MIGRATIONS_DIR/0150_refactor_aeronaves_remove_codigo.sql" ]; then
  echo "❌ Migration 0150 não encontrada!"
  exit 1
fi

if [ ! -f "$MIGRATIONS_DIR/0151_migrate_aeronave_references.sql" ]; then
  echo "❌ Migration 0151 não encontrada!"
  exit 1
fi

echo "✅ Migrations encontradas"
echo ""

# Executar migrations no banco local
echo "📝 Aplicando migration 0150 (refactor schema)..."
wrangler d1 execute airtrust-db --local --file="$MIGRATIONS_DIR/0150_refactor_aeronaves_remove_codigo.sql"

echo ""
echo "📝 Aplicando migration 0151 (migrate data)..."
wrangler d1 execute airtrust-db --local --file="$MIGRATIONS_DIR/0151_migrate_aeronave_references.sql"

echo ""
echo "✅ Migrations aplicadas com sucesso!"
echo ""
echo "🔍 Verificando estrutura..."

# Verificar estrutura das tabelas
wrangler d1 execute airtrust-db --local --command="SELECT sql FROM sqlite_master WHERE type='table' AND name='modelos_aeronave';"

echo ""
echo "🔍 Verificando dados..."
wrangler d1 execute airtrust-db --local --command="SELECT COUNT(*) as total FROM modelos_aeronave WHERE deleted_at IS NULL;"

echo ""
echo "🎉 Refatoração concluída!"
echo ""
echo "⚠️  IMPORTANTE: Teste o sistema localmente antes de aplicar em produção!"
echo ""
echo "Para aplicar em produção (CUIDADO!):"
echo "  wrangler d1 execute airtrust-db --remote --file=$MIGRATIONS_DIR/0150_refactor_aeronaves_remove_codigo.sql"
echo "  wrangler d1 execute airtrust-db --remote --file=$MIGRATIONS_DIR/0151_migrate_aeronave_references.sql"
