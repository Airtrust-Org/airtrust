#!/bin/bash

# CLONE REAL: Exporta SQL dumps de produção e importa no local

set -e

echo "🔄 CLONE PRODUÇÃO → LOCAL (via SQL dumps)"
echo "=========================================="
echo ""

cd "$(dirname "$0")/../worker-airtrust" || exit 1

DB_FILE="../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/cd45cc5264daa1c125545b5b4c0756df95d8b6ac5900ecf52323d90f61a47f2d.sqlite"

if [ ! -f "$DB_FILE" ]; then
  echo "❌ Banco local não encontrado"
  exit 1
fi

echo "📦 Banco local: $(du -h "$DB_FILE" | cut -f1)"
echo ""

# Backup
BACKUP_FILE="../backups/local-pre-clone-$(date +%Y%m%d-%H%M%S).sqlite"
mkdir -p ../backups
cp "$DB_FILE" "$BACKUP_FILE"
echo "💾 Backup: $BACKUP_FILE"
echo ""

# Tabelas críticas
TABLES="sessoes_template cadastro_manobras simuladores manobras manobras_categorias funcionarios usuarios tipos_sessao aeronaves empresas licencas"

TEMP_SQL="/tmp/prod-export-$(date +%Y%m%d-%H%M%S).sql"
> "$TEMP_SQL"

echo "📥 Exportando tabelas de PRODUÇÃO..."
echo ""

for table in $TABLES; do
  echo -n "  → $table ... "
  
  # Contar registros em produção
  COUNT=$(npx wrangler d1 execute airtrust-db --remote \
    --command="SELECT COUNT(*) as c FROM $table" \
    --json 2>/dev/null | jq -r '.[0].results[0].c' 2>/dev/null || echo "0")
  
  if [ "$COUNT" -gt 0 ]; then
    echo "$COUNT registros"
    
    # Gerar INSERTs (limitar a 1000 por vez para não travar)
    LIMIT=1000
    OFFSET=0
    
    while [ $OFFSET -lt $COUNT ]; do
      npx wrangler d1 execute airtrust-db --remote \
        --command="SELECT * FROM $table LIMIT $LIMIT OFFSET $OFFSET" \
        --json 2>/dev/null | \
        jq -r --arg table "$table" '
          .[0].results[] |
          . as $row |
          keys as $cols |
          "INSERT OR REPLACE INTO \($table) (" + ($cols | join(", ")) + ") VALUES (" + 
          ([.[] | if type == "string" then "\"" + (. | gsub("\""; "\"\"")) + "\"" elif . == null then "NULL" else tostring end] | join(", ")) + 
          ");"
        ' >> "$TEMP_SQL" 2>/dev/null
      
      OFFSET=$((OFFSET + LIMIT))
    done
  else
    echo "vazia"
  fi
done

echo ""
echo "📤 Importando no banco local..."
sqlite3 "$DB_FILE" < "$TEMP_SQL"

echo ""
echo "✅ CLONE COMPLETO!"
echo ""

# Resumo
echo "📊 RESUMO:"
for table in $TABLES; do
  COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "0")
  printf "  %-25s %6d registros\n" "$table" "$COUNT"
done

echo ""
echo "💾 Tamanho final: $(du -h "$DB_FILE" | cut -f1)"
echo ""
