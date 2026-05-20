#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "🔄 Clonando TODOS os dados de simuladores da produção..."

CONFIG="worker-airtrust/wrangler.toml"
DB_NAME="airtrust-db"

# 1. CATEGORIAS DE MANOBRAS
echo "📥 1/3 - Exportando categorias de manobras..."
CATEGORIAS_JSON=$(curl -s "https://airtrust.airtrust.workers.dev/api/simuladores/categorias")

echo "$CATEGORIAS_JSON" | jq -r '.data[] | "INSERT OR IGNORE INTO manobras_categorias (id, codigo, nome, tipo, ordem, cor, created_at, updated_at) VALUES (\(.id), \"\(.codigo)\", \"\(.nome)\", \"\(.tipo // "NORMAL")\", \(.ordem // 0), \"\(.cor // "#6B7280")\", \"\(.created_at)\", \"\(.updated_at)\");"' > /tmp/categorias_insert.sql

npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --file /tmp/categorias_insert.sql
CATEGORIAS_COUNT=$(npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --command "SELECT COUNT(*) as c FROM manobras_categorias" 2>/dev/null | jq -r '.[0].results[0].c' 2>/dev/null || echo 0)
echo "   ✅ $CATEGORIAS_COUNT categorias"

# 2. MANOBRAS (cadastro completo)
echo "📥 2/3 - Exportando manobras..."
MANOBRAS_JSON=$(curl -s "https://airtrust.airtrust.workers.dev/api/simuladores/manobras")

echo "$MANOBRAS_JSON" | jq -r '.data[] | "INSERT OR IGNORE INTO cadastro_manobras (codigo, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, obrigatoria, created_at, updated_at) VALUES (\"\(.codigo)\", \"\(.nome // .descricao)\", \"\(.categoria // "")\", \"INICIAL\", \"A139\", \(.ordem // 0), \(.obrigatoria // 1), \"\(.created_at)\", \"\(.updated_at)\");"' > /tmp/manobras_insert.sql

npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --file /tmp/manobras_insert.sql
MANOBRAS_COUNT=$(npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --command "SELECT COUNT(*) as c FROM cadastro_manobras" 2>/dev/null | jq -r '.[0].results[0].c' 2>/dev/null || echo 0)
echo "   ✅ $MANOBRAS_COUNT manobras"

# 3. RELAÇÕES MODELO-MANOBRAS (template_manobras)
echo "📥 3/3 - Exportando relações modelo-manobras..."

> /tmp/template_manobras_insert.sql

# Buscar todos modelos da produção e suas manobras
MODELOS=$(curl -s "https://airtrust.airtrust.workers.dev/api/simuladores/modelos" | jq -r '.data[].id')

for MODELO_ID in $MODELOS; do
  MANOBRAS_MODELO=$(curl -s "https://airtrust.airtrust.workers.dev/api/simuladores/modelos/$MODELO_ID/manobras")
  
  echo "$MANOBRAS_MODELO" | jq -r --arg mid "$MODELO_ID" '.data[]? | "INSERT OR IGNORE INTO template_manobras (template_id, manobra_id, ordem, obrigatoria) SELECT \($mid | tonumber), id, \(.ordem // 0), \(.obrigatoria // 1) FROM cadastro_manobras WHERE codigo = '\''\(.codigo)'\'' LIMIT 1;"' >> /tmp/template_manobras_insert.sql
done

npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --file /tmp/template_manobras_insert.sql
RELACOES_COUNT=$(npx wrangler d1 execute "$DB_NAME" --config "$CONFIG" --local --command "SELECT COUNT(*) as c FROM template_manobras" 2>/dev/null | jq -r '.[0].results[0].c' 2>/dev/null || echo 0)
echo "   ✅ $RELACOES_COUNT relações modelo-manobras"

# Limpeza
rm -f /tmp/categorias_insert.sql /tmp/manobras_insert.sql /tmp/template_manobras_insert.sql

echo ""
echo "✅ Clonagem completa!"
echo "📊 Resumo:"
echo "   - $CATEGORIAS_COUNT categorias de manobras"
echo "   - $MANOBRAS_COUNT manobras cadastradas"
echo "   - $RELACOES_COUNT relações modelo-manobras"
