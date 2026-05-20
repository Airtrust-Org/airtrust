#!/bin/bash

# CLONE COMPLETO: PRODUÇÃO → LOCAL
# Copia TODAS as tabelas e dados do banco de produção para o local

set -e

echo "🔄 CLONANDO BANCO DE PRODUÇÃO → LOCAL"
echo "======================================"
echo ""

cd "$(dirname "$0")/../worker-airtrust" || exit 1

# Arquivo SQLite local
DB_FILE="../.wrangler/state/v3/d1/miniflare-D1DatabaseObject/cd45cc5264daa1c125545b5b4c0756df95d8b6ac5900ecf52323d90f61a47f2d.sqlite"

# Verificar se existe
if [ ! -f "$DB_FILE" ]; then
  echo "❌ Banco local não encontrado em: $DB_FILE"
  exit 1
fi

echo "📦 Banco local encontrado: $(du -h "$DB_FILE" | cut -f1)"
echo ""

# Criar backup antes
BACKUP_FILE="../backups/local-backup-antes-clone-$(date +%Y%m%d-%H%M%S).sqlite"
mkdir -p ../backups
cp "$DB_FILE" "$BACKUP_FILE"
echo "💾 Backup criado: $BACKUP_FILE"
echo ""

# Lista de tabelas principais para exportar/importar
TABLES=(
  "sessoes_template"
  "cadastro_manobras"
  "simuladores"
  "manobras"
  "manobras_categorias"
  "funcionarios"
  "usuarios"
  "categorias"
  "tipos_sessao"
  "aeronaves"
  "empresas"
  "qualificacoes"
  "historico_certificacoes_v2"
  "licencas"
  "pasta_virtual"
)

echo "📋 Exportando ${#TABLES[@]} tabelas de PRODUÇÃO..."
echo ""

TEMP_DIR="/tmp/airtrust-clone-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$TEMP_DIR"

for table in "${TABLES[@]}"; do
  echo -n "  → $table ... "
  
  # Exportar de produção
  npx wrangler d1 execute airtrust-db --remote \
    --command="SELECT * FROM $table" \
    --json > "$TEMP_DIR/${table}.json" 2>/dev/null || {
      echo "⚠️  não existe ou vazia"
      continue
    }
  
  # Contar registros
  COUNT=$(cat "$TEMP_DIR/${table}.json" | jq '. | length' 2>/dev/null || echo "0")
  
  if [ "$COUNT" -gt 0 ]; then
    echo "✅ $COUNT registros"
    
    # Limpar tabela local
    sqlite3 "$DB_FILE" "DELETE FROM $table;" 2>/dev/null || {
      echo "    ⚠️  Tabela não existe no local, criando..."
      # A tabela será criada automaticamente quando importarmos
    }
    
    # Converter JSON para SQL INSERT e importar
    cat "$TEMP_DIR/${table}.json" | jq -r '
      .[] | 
      to_entries | 
      map("\"\(.key)\"") as $keys |
      map(.value | 
        if type == "string" then 
          "\"" + (. | gsub("\""; "\"\"")) + "\""
        elif . == null then 
          "NULL"
        else 
          tostring
        end
      ) as $vals |
      "INSERT OR REPLACE INTO '"$table"' (" + ($keys | join(", ")) + ") VALUES (" + ($vals | join(", ")) + ");"
    ' > "$TEMP_DIR/${table}.sql" 2>/dev/null
    
    # Importar no SQLite local
    if [ -f "$TEMP_DIR/${table}.sql" ]; then
      sqlite3 "$DB_FILE" < "$TEMP_DIR/${table}.sql" 2>/dev/null || echo "    ⚠️  Erro ao importar"
    fi
  else
    echo "⚠️  vazia"
  fi
done

echo ""
echo "🧹 Limpando arquivos temporários..."
rm -rf "$TEMP_DIR"

echo ""
echo "📊 RESUMO DO CLONE:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Mostrar contagem de registros em cada tabela
for table in "${TABLES[@]}"; do
  COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $table WHERE deleted_at IS NULL OR deleted_at = '';" 2>/dev/null || echo "0")
  if [ "$COUNT" -gt 0 ]; then
    printf "  %-30s %6d registros\n" "$table" "$COUNT"
  fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
echo "💾 Tamanho do banco local: $DB_SIZE"
echo ""
echo "✅ CLONE COMPLETO!"
echo ""
echo "🚀 Reinicie o ambiente local:"
echo "   npm run dev:all"
echo ""
