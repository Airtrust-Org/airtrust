#!/bin/bash
# =============================================
# Script: Backup Automático D1 → R2
# FASE 32
# Data: 2025-11-15
# =============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$PROJECT_ROOT/worker-airtrust"
BACKUPS_DIR="$PROJECT_ROOT/backups"
DB="airtrust-db"
BUCKET="airtrust-r2"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

mkdir -p "$BACKUPS_DIR"

# =============================================
# 1. GERAR NOME DO ARQUIVO
# =============================================
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="backup_${DB}_${TIMESTAMP}.sql"
FILEPATH="$BACKUPS_DIR/$FILENAME"
LABEL="${1:-automatic_backup}"

echo ""
echo "=========================================="
echo " BACKUP AUTOMÁTICO D1 → R2"
echo "=========================================="
echo ""

log_info "Iniciando backup: $FILENAME"
log_info "Label: $LABEL"

# =============================================
# 2. EXPORT D1 PARA ARQUIVO SQL
# =============================================
cd "$WORKER_DIR"

log_info "Exportando D1 para SQL..."
npx wrangler d1 export "$DB" --remote --output "$FILEPATH"

if [ ! -f "$FILEPATH" ]; then
  log_error "Erro: Arquivo de backup não foi criado"
  exit 1
fi

FILESIZE=$(stat -f%z "$FILEPATH" 2>/dev/null || stat -c%s "$FILEPATH")
FILESIZE_MB=$(echo "scale=2; $FILESIZE / 1048576" | bc)

log_success "Export concluído: ${FILESIZE_MB}MB"

# =============================================
# 3. UPLOAD PARA R2
# =============================================
log_info "Uploading para R2..."

npx wrangler r2 object put "$BUCKET/backups/$FILENAME" \
  --file="$FILEPATH" \
  --content-type="application/sql"

log_success "Upload para R2 concluído"

# =============================================
# 4. REGISTRAR NA TABELA BACKUPS
# =============================================
log_info "Registrando backup na tabela..."

npx wrangler d1 execute "$DB" --remote --command "
INSERT INTO backups (
  nome_arquivo,
  filename, 
  tamanho,
  size_bytes, 
  backup_type, 
  label, 
  storage_path,
  created_at
) VALUES (
  '$FILENAME',
  '$FILENAME',
  $FILESIZE,
  $FILESIZE,
  'AUTOMATIC',
  '$LABEL',
  'r2://airtrust-r2/backups/$FILENAME',
  datetime('now')
);"

log_success "Backup registrado no banco"

# =============================================
# 5. LIMPEZA LOCAL (MANTER ÚLTIMOS 7 DIAS)
# =============================================
log_info "Limpando backups locais antigos..."

find "$BACKUPS_DIR" -name "backup_*.sql" -mtime +7 -delete 2>/dev/null || true
REMAINING=$(ls -1 "$BACKUPS_DIR"/backup_*.sql 2>/dev/null | wc -l)

log_info "Backups locais restantes: $REMAINING"

# =============================================
# 6. RESUMO FINAL
# =============================================
echo ""
echo "=========================================="
echo " BACKUP CONCLUÍDO"
echo "=========================================="
echo ""
echo "Arquivo:       $FILENAME"
echo "Tamanho:       ${FILESIZE_MB}MB"
echo "Destino R2:    r2://airtrust-r2/backups/$FILENAME"
echo "Label:         $LABEL"
echo "Timestamp:     $TIMESTAMP"
echo ""

log_success "Backup automático finalizado com sucesso!"
