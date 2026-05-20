#!/bin/bash
# Aplica migration 0133 para corrigir FKs funcionarios_old
# Usa API do Worker para executar queries diretas no D1

set -e

API_URL="https://airtrust-api-production.airtrust.workers.dev"

echo "🔧 Aplicando migration 0133..."
echo "📍 API: $API_URL"

# Ler SQL da migration
MIGRATION_SQL=$(cat worker-airtrust/migrations/0133_fix_funcionarios_old_fk_refs.sql)

# Criar endpoint temporário para executar migration
# (na prática, vamos executar localmente com wrangler)

echo "Tentando com wrangler local..."
cd worker-airtrust

# Método 1: Via arquivo SQL
wrangler d1 execute airtrust-db --file=./migrations/0133_fix_funcionarios_old_fk_refs.sql --remote

echo "✅ Migration aplicada!"
