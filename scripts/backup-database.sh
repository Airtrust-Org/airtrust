#!/bin/bash

# AirTrust v2 - Database Backup Script
# Creates a backup of the D1 database

set -e

echo "🗄️  AirTrust v2 - Database Backup"
#!/bin/bash

# AirTrust v2 - Database Backup Script (robusto)
# Cria backup tolerante a diferenças de schema e tabelas ausentes.

set -o pipefail

echo "🗄️  AirTrust v2 - Database Backup"
echo "================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if ! command -v wrangler &> /dev/null; then
  echo -e "${RED}❌ wrangler CLI não encontrado${NC}"
  exit 1
fi

db_name=""
label=""
remote_flag=""
tables_arg=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --db|-d)
      db_name="$2"; shift 2 ;;
    --label|-l)
      label="$2"; shift 2 ;;
    --remote)
      remote_flag="--remote"; shift ;;
    --tables)
      tables_arg="$2"; shift 2 ;;
    *)
      echo -e "${YELLOW}⚠️  Ignorando argumento desconhecido: $1${NC}"; shift ;;
  esac
done

if [ -z "$db_name" ]; then
  read -p "Nome do database (ex: airtrust-db): " db_name
fi

if [ -z "$db_name" ]; then
  echo -e "${RED}❌ Database obrigatório${NC}"; exit 1
fi

BACKUP_DIR="backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
if [ -n "$label" ]; then
  label_slug=$(echo "$label" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]/-/g' | sed 's/-\+/-/g' | sed 's/^-\|-$//g')
else
  label_slug=""
fi

echo "📦 Iniciando backup"
echo "Database: $db_name"
[ -n "$label" ] && echo "Label: $label (slug: $label_slug)"
echo "Timestamp: $TIMESTAMP"
echo "Modo: ${remote_flag:+remote}${remote_flag:="local"}" | sed 's/localremote/remote/'
echo ""

export_table() {
  local tbl="$1"; shift
  local query="$1"; shift
  local outfile="$1"; shift
  echo "Exportando ${tbl}..."
  if wrangler d1 execute "$db_name" $remote_flag --command="SELECT name FROM sqlite_master WHERE type='table' AND name='${tbl}'" --json 2>/dev/null | grep -q "${tbl}"; then
    if wrangler d1 execute "$db_name" $remote_flag --command="$query" --json > "$outfile" 2>/dev/null; then
      echo "✅ ${tbl} exportado"
    else
      echo "⚠️  Falha ao exportar ${tbl} (query)"
    fi
  else
    echo "⚠️  Tabela ${tbl} ausente - pulando"
  fi
}

OUTPUT_FUNC="${BACKUP_DIR}/funcionarios_${TIMESTAMP}.json"
OUTPUT_USERS="${BACKUP_DIR}/usuarios_${TIMESTAMP}.json"
OUTPUT_CERTS="${BACKUP_DIR}/certificacoes_${TIMESTAMP}.json"
OUTPUT_AUDIT="${BACKUP_DIR}/audit_logs_${TIMESTAMP}.json"

# Lista de arquivos realmente criados
CREATED_FILES=()

if [ -z "$tables_arg" ]; then
  # Export padrão (tentativa de tabelas principais)
  if export_table "funcionarios" "SELECT * FROM funcionarios" "$OUTPUT_FUNC" | grep -q "✅"; then CREATED_FILES+=("$(basename "$OUTPUT_FUNC")"); fi || true
  if export_table "usuarios" "SELECT * FROM usuarios" "$OUTPUT_USERS" | grep -q "✅"; then CREATED_FILES+=("$(basename "$OUTPUT_USERS")"); fi || true
else
  # Export específico conforme --tables (CSV)
  IFS=',' read -ra REQ_TABLES <<< "$tables_arg"
  for t in "${REQ_TABLES[@]}"; do
    t_trim=$(echo "$t" | xargs)
    outfile="${BACKUP_DIR}/${t_trim}_${TIMESTAMP}.json"
    if export_table "$t_trim" "SELECT * FROM $t_trim" "$outfile" | grep -q "✅"; then CREATED_FILES+=("$(basename "$outfile")"); fi || true
  done
fi

if [ -z "$tables_arg" ]; then
  if wrangler d1 execute "$db_name" $remote_flag --command="SELECT name FROM sqlite_master WHERE type='table' AND name='historico_certificacoes_v2'" --json 2>/dev/null | grep -q "historico_certificacoes_v2"; then
    if export_table "historico_certificacoes_v2" "SELECT * FROM historico_certificacoes_v2" "$OUTPUT_CERTS" | grep -q "✅"; then CREATED_FILES+=("$(basename "$OUTPUT_CERTS")"); fi || true
  else
    echo "ℹ️  Fallback para qualificacoes_historico minimal"
    if export_table "qualificacoes_historico" "SELECT * FROM qualificacoes_historico" "$OUTPUT_CERTS" | grep -q "✅"; then CREATED_FILES+=("$(basename "$OUTPUT_CERTS")"); fi || true
  fi
fi
if [ -z "$tables_arg" ]; then
  if export_table "audit_logs" "SELECT * FROM audit_logs" "$OUTPUT_AUDIT" | grep -q "✅"; then CREATED_FILES+=("$(basename "$OUTPUT_AUDIT")"); fi || true
fi

echo ""
echo "📁 Arquivos gerados:"; if [ ${#CREATED_FILES[@]} -eq 0 ]; then echo "(nenhum gerado)"; else printf '  - %s\n' "${CREATED_FILES[@]}"; fi

# Se não especificado --tables e nenhum arquivo foi criado, tentar export full inventory
if [ -z "$tables_arg" ] && [ ${#CREATED_FILES[@]} -eq 0 ]; then
  echo "🔄 Nenhum match padrão. Enumerando todas as tabelas..."
  RAW_TABLES=$(wrangler d1 execute "$db_name" $remote_flag --command="SELECT name FROM sqlite_master WHERE type='table'" --json 2>/dev/null)
  # Parsing sem jq: extrai linhas com "name" e pega valor
  ALL_TABLES=$(echo "$RAW_TABLES" | grep -o '"name"[: ]*"[^"]\+"' | sed 's/.*"name"[: ]*"\([^"]\+\)"/\1/')
  if [ -n "$ALL_TABLES" ]; then
    echo "$ALL_TABLES" | while read -r tbl; do
      [ -z "$tbl" ] && continue
      outfile="${BACKUP_DIR}/${tbl}_${TIMESTAMP}.json"
      if export_table "$tbl" "SELECT * FROM $tbl" "$outfile" | grep -q "✅"; then CREATED_FILES+=("$(basename "$outfile")"); fi || true
    done
  fi
  echo "📁 Após inventário:"; if [ ${#CREATED_FILES[@]} -eq 0 ]; then echo "(continua vazio)"; else printf '  - %s\n' "${CREATED_FILES[@]}"; fi
fi

MANIFEST="${BACKUP_DIR}/backup_manifest_${TIMESTAMP}.json"
cat > "$MANIFEST" <<EOF
{
  "backup_date": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "database_name": "$db_name",
  "label": "$label",
  "files": [$(printf '"%s",' "${CREATED_FILES[@]}" | sed 's/,$//')],
  "version": "2.1.0",
  "remote": "${remote_flag:+true}${remote_flag:="false"}"
}
EOF

echo "📋 Manifest: $MANIFEST"

if [ ${#CREATED_FILES[@]} -eq 0 ]; then
  echo "⚠️  Nenhum arquivo exportado. Nada para compactar."
  echo "✨ Backup (manifest vazio) concluído"
else
  ARCHIVE_NAME="${BACKUP_DIR}/backup_${db_name}_${TIMESTAMP}${label_slug:+_}${label_slug}.tar.gz"
  echo "🗜️  Compactando em ${ARCHIVE_NAME}..."
  tar -czf "$ARCHIVE_NAME" -C "$BACKUP_DIR" "$(basename "$MANIFEST")" $(printf ' "%s"' "${CREATED_FILES[@]}")
  rm -f "$MANIFEST" ${CREATED_FILES[@]/#/${BACKUP_DIR}/} || true
  echo -e "${GREEN}✅ Arquivo final: $ARCHIVE_NAME${NC}"
  SIZE=$(du -h "$ARCHIVE_NAME" | cut -f1)
  echo "📊 Tamanho: $SIZE"
  echo "✨ Backup concluído"
  echo "💡 Restaurar: ./scripts/restore-database.sh $ARCHIVE_NAME"
fi
rm "${BACKUP_DIR}/usuarios_${TIMESTAMP}.json"
rm "${BACKUP_DIR}/certificacoes_${TIMESTAMP}.json"
rm "${BACKUP_DIR}/audit_logs_${TIMESTAMP}.json"
rm "${BACKUP_DIR}/backup_manifest_${TIMESTAMP}.json"

echo -e "${GREEN}✅ Backup compressed: ${ARCHIVE_NAME}${NC}"
echo ""

# Calculate size
BACKUP_SIZE=$(du -h "$ARCHIVE_NAME" | cut -f1)
echo "📊 Backup size: $BACKUP_SIZE"
echo ""

echo "✨ Backup complete!"
echo ""
echo "💡 To restore this backup:"
echo "   ./scripts/restore-database.sh ${ARCHIVE_NAME}"
echo ""
