#!/bin/bash
# Script para aplicar migration 131 (matricula opcional) via D1 HTTP API
# Usa autenticação via CLOUDFLARE_API_TOKEN

set -e

# Verificar variável de ambiente
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN não configurado"
  exit 1
fi

ACCOUNT_ID="4dca4e5fddc6a351651dd224f456586f"
DB_ID="1c11b7c1-4506-4b09-bd87-d867e57d00e5"

echo "📊 Aplicando migration 131: matricula opcional"
echo ""

# Ler SQL da migration
SQL_FILE="migrations/131_matricula_opcional.sql"

if [ ! -f "$SQL_FILE" ]; then
  echo "❌ Arquivo $SQL_FILE não encontrado"
  exit 1
fi

# Aplicar via HTTP API
echo "🚀 Executando migration..."

curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/d1/database/$DB_ID/query" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "sql": $(cat "$SQL_FILE" | jq -Rs .)
}
EOF

echo ""
echo "✅ Migration aplicada com sucesso!"
