#!/bin/bash
# =============================================
# Script: Limpeza de Duplicatas
# FASE 31 - Parte 3
# Data: 2025-11-15
# Objetivo: Remover duplicatas mantendo registro mais antigo
# =============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$PROJECT_ROOT/worker-airtrust"
DB="airtrust-db"

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }

cd "$WORKER_DIR"

echo ""
echo "=========================================="
echo " LIMPEZA DE DUPLICATAS"
echo "=========================================="
echo ""

log_info "Removendo duplicatas (mantém mais antigo)..."

npx wrangler d1 execute "$DB" --remote --command "
DELETE FROM qualificacoes_historico
WHERE id IN (
  SELECT qh2.id
  FROM qualificacoes_historico qh1
  INNER JOIN qualificacoes_historico qh2 
    ON qh1.funcionario_id = qh2.funcionario_id
    AND qh1.qualificacao_id = qh2.qualificacao_id
    AND qh1.data_conclusao = qh2.data_conclusao
    AND qh1.id < qh2.id  -- Mantém o mais antigo (menor ID)
  WHERE qh1.deleted_at IS NULL 
    AND qh2.deleted_at IS NULL
);
"

log_success "Duplicatas removidas permanentemente"

echo ""
log_info "Validação final..."

npx wrangler d1 execute "$DB" --remote --command "
SELECT 
  COUNT(*) as total,
  COUNT(CASE WHEN qualificacao_id IS NOT NULL THEN 1 END) as com_qualif_id,
  COUNT(CASE WHEN qualificacao_id IS NULL THEN 1 END) as sem_qualif_id
FROM qualificacoes_historico 
WHERE deleted_at IS NULL;
"

echo ""
log_success "Limpeza concluída!"
