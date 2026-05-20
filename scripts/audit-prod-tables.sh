#!/usr/bin/env bash
set -euo pipefail

# Exportar TODAS as tabelas do D1 de produção para análise
# Uso: CLOUDFLARE_ACCOUNT_ID=xxx D1_PROD_DB=yyy ./scripts/audit-prod-tables.sh

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] || [ -z "${D1_PROD_DB:-}" ]; then
  echo "❌ Variáveis de ambiente ausentes:"
  echo "export CLOUDFLARE_ACCOUNT_ID=seu_account_id"
  echo "export D1_PROD_DB=airtrust-db"
  exit 1
fi

export CF_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"

AUDIT_DIR="./audit-producao"
mkdir -p "$AUDIT_DIR"

echo "🔍 Auditando todas tabelas de produção..."
echo ""

# 1) Listar todas as tabelas
echo "📋 Tabelas em produção:"
wrangler d1 execute "$D1_PROD_DB" --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%cf_%' ORDER BY name;" 2>&1 | tee "$AUDIT_DIR/01_tabelas.json"

echo ""
echo "📊 Contagem de dados por tabela:"

# 2) Contar registros em cada tabela
wrangler d1 execute "$D1_PROD_DB" --remote --command "
SELECT name, (SELECT COUNT(*) FROM (SELECT * FROM sqlite_master WHERE type='table') t1 WHERE t1.name = sqlite_master.name) as table_count
FROM sqlite_master 
WHERE type='table' AND name NOT LIKE '%cf_%' AND name NOT LIKE 'sqlite_%'
ORDER BY name;
" 2>&1 | tee "$AUDIT_DIR/02_contagem.json"

# 3) Dump detalhado de cada tabela (schema + sample rows)
TABLES=$(wrangler d1 execute "$D1_PROD_DB" --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '%cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name;" 2>&1 | grep '"name"' | sed 's/.*"name": "\([^"]*\)".*/\1/')

for TABLE in $TABLES; do
  echo ""
  echo "📄 Tabela: $TABLE"
  
  # Schema
  echo "   Schema:"
  wrangler d1 execute "$D1_PROD_DB" --remote --command "PRAGMA table_info($TABLE);" 2>&1 | head -20 | tail -5
  
  # Contagem
  COUNT=$(wrangler d1 execute "$D1_PROD_DB" --remote --command "SELECT COUNT(*) as cnt FROM $TABLE;" 2>&1 | grep '"cnt"' | head -1 | sed 's/.*"cnt": \([0-9]*\).*/\1/')
  echo "   Registros: $COUNT"
done

echo ""
echo "✅ Auditoria salva em: $AUDIT_DIR/"
