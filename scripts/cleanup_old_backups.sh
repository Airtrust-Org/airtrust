#!/bin/bash
# =============================================
# Script: Limpeza de Backups Antigos
# FASE 32
# Data: 2025-11-15
# Política: 30 dias recentes + 1 por mês
# =============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$PROJECT_ROOT/worker-airtrust"
DB="airtrust-db"
BUCKET="airtrust-r2"

# Cores
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

cd "$WORKER_DIR"

echo ""
echo "=========================================="
echo " LIMPEZA DE BACKUPS ANTIGOS"
echo "=========================================="
echo ""

log_info "Aplicando política de retenção..."

# Lista backups com mais de 30 dias
CUTOFF_DATE=$(date -u -v-30d +%Y-%m-%d 2>/dev/null || date -u -d '30 days ago' +%Y-%m-%d)

log_info "Removendo backups anteriores a: $CUTOFF_DATE"

# Query backups elegíveis para remoção (AUTOMATIC, >30 dias, não dia 1)
log_warning "Backups elegíveis para remoção:"

npx wrangler d1 execute "$DB" --remote --command "
SELECT 
  id,
  filename,
  backup_type,
  DATE(created_at) as data,
  ROUND(size_bytes / 1048576.0, 2) as size_mb
FROM backups
WHERE DATE(created_at) < '$CUTOFF_DATE'
  AND backup_type = 'AUTOMATIC'
  AND strftime('%d', created_at) != '01'
ORDER BY created_at DESC
LIMIT 20;
"

log_info "Retenção: Manter 30 dias recentes + backups do dia 1 de cada mês"
log_warning "Remoção automática não implementada (segurança)"
log_info "Para remover manualmente: wrangler r2 object delete airtrust-r2 backups/FILENAME"

echo ""
