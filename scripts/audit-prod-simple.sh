#!/usr/bin/env bash
set -euo pipefail

# Simple production data audit - lists all tables and row counts
# Requirement: CLOUDFLARE_ACCOUNT_ID and D1_PROD_DB environment variables

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "❌ Missing: CLOUDFLARE_ACCOUNT_ID"
  echo "   Example: export CLOUDFLARE_ACCOUNT_ID=1234567890abcdef"
  exit 1
fi

if [ -z "${D1_PROD_DB:-}" ]; then
  echo "❌ Missing: D1_PROD_DB"
  echo "   Example: export D1_PROD_DB=airtrust-db"
  exit 1
fi

export CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"

AUDIT_DIR="./audit-producao"
mkdir -p "$AUDIT_DIR"

echo "🔍 Auditando produção: $D1_PROD_DB"
echo ""

# Get list of all tables
TABLES=$(wrangler d1 execute "$D1_PROD_DB" --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%cf_%' ORDER BY name;" 2>&1)

echo "📋 Tabelas encontradas:"
echo "$TABLES"
echo ""

# Count rows in each table
echo "📊 Contagem de registros por tabela:"
echo ""

TABLE_LIST=$(echo "$TABLES" | grep -oP '(?<="name":\s")[^"]+' 2>/dev/null || echo "")

if [ -z "$TABLE_LIST" ]; then
  echo "❌ Erro: não foi possível extrair lista de tabelas"
  echo "Resposta bruta:"
  echo "$TABLES"
  exit 1
fi

for TABLE in $TABLE_LIST; do
  COUNT=$(wrangler d1 execute "$D1_PROD_DB" --remote --command "SELECT COUNT(*) as cnt FROM $TABLE;" 2>&1)
  COUNT_NUM=$(echo "$COUNT" | grep -oP '(?<="cnt":\s?)\d+' | head -1)
  echo "  $TABLE: $COUNT_NUM registros"
  echo "$TABLE: $COUNT_NUM" >> "$AUDIT_DIR/table-counts.txt"
done

echo ""
echo "✅ Auditoria concluída!"
echo "   Resultados: $AUDIT_DIR/table-counts.txt"
