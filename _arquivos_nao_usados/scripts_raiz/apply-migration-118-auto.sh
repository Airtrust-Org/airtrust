#!/bin/bash
set -e

echo "🔧 Aplicando Migration 0118 via Cloudflare API..."
echo ""

# Account ID do Cloudflare
ACCOUNT_ID="4dca4e5fddc6a351651dd224f456586f"
DATABASE_NAME="airtrust-db"

# SQL da migration
SQL_COMMANDS='
ALTER TABLE funcionarios ADD COLUMN modelo_aeronave_id TEXT;
UPDATE funcionarios SET modelo_aeronave_id = aeronave WHERE aeronave IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_modelo_aeronave ON funcionarios(modelo_aeronave_id);
'

echo "📝 SQL a ser executado:"
echo "$SQL_COMMANDS"
echo ""

# Opção 1: Via wrangler d1 execute (se credenciais OK)
echo "Opção 1: Via Wrangler"
echo "npx wrangler d1 execute airtrust-db --remote --command=\"$SQL_COMMANDS\""
echo ""

# Opção 2: Manual via Dashboard
echo "Opção 2: Manual via Dashboard"
echo "1. Acesse: https://dash.cloudflare.com/$ACCOUNT_ID/workers/d1/databases/$DATABASE_NAME"
echo "2. Clique em 'Console'"
echo "3. Cole e execute o SQL acima"
echo ""

# Tentar executar automaticamente
echo "🚀 Tentando executar automaticamente..."
npx wrangler d1 execute airtrust-db --remote --command="$SQL_COMMANDS" 2>&1 || {
    echo ""
    echo "⚠️  Execução automática falhou (problema de permissões)"
    echo ""
    echo "📋 INSTRUÇÕES MANUAIS:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "1. Acesse o Cloudflare Dashboard"
    echo "2. Navegue até D1 > airtrust-db > Console"
    echo "3. Execute cada comando SQL:"
    echo ""
    echo "   ALTER TABLE funcionarios ADD COLUMN modelo_aeronave_id TEXT;"
    echo "   UPDATE funcionarios SET modelo_aeronave_id = aeronave WHERE aeronave IS NOT NULL;"
    echo "   CREATE INDEX IF NOT EXISTS idx_funcionarios_modelo_aeronave ON funcionarios(modelo_aeronave_id);"
    echo ""
    echo "4. Verifique o resultado:"
    echo "   SELECT id, nome, aeronave, modelo_aeronave_id FROM funcionarios LIMIT 5;"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}
