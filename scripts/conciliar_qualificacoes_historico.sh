#!/bin/bash
# =============================================
# Script: Conciliação de qualificacoes_historico
# FASE 31 - Parte 2
# Data: 2025-11-15
# Objetivo: Popular qualificacao_id via matching com qualificacoes_tipos
# =============================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$PROJECT_ROOT/worker-airtrust"
REPORTS_DIR="$PROJECT_ROOT/reports"
DB="airtrust-db"

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

mkdir -p "$REPORTS_DIR"

cd "$WORKER_DIR"

echo ""
echo "=========================================="
echo " CONCILIAÇÃO DE QUALIFICACOES_HISTORICO"
echo "=========================================="
echo ""

# =============================================
# 1. ESTATÍSTICAS INICIAIS
# =============================================
log_info "1. Coletando estatísticas iniciais..."

echo "--- ANTES da Conciliação ---"
npx wrangler d1 execute "$DB" --remote --command "
SELECT 
  COUNT(*) as total_registros,
  COUNT(CASE WHEN qualificacao_id IS NOT NULL THEN 1 END) as com_qualif_id,
  COUNT(CASE WHEN qualificacao_id IS NULL THEN 1 END) as sem_qualif_id,
  COUNT(CASE WHEN funcionario_id IN (SELECT CAST(id AS TEXT) FROM funcionarios WHERE deleted_at IS NULL) THEN 1 END) as func_validos
FROM qualificacoes_historico 
WHERE deleted_at IS NULL;
"

echo ""

# =============================================
# 2. MATCHING QUALIFICACAO_ID (NOME + CODIGO)
# =============================================
log_info "2. Matching qualificacao_id via NOME + CODIGO..."

npx wrangler d1 execute "$DB" --remote --command "
UPDATE qualificacoes_historico 
SET qualificacao_id = CAST((
  SELECT qt.id 
  FROM qualificacoes_tipos qt 
  WHERE UPPER(TRIM(qt.nome)) = UPPER(TRIM(qualificacoes_historico.nome))
    AND UPPER(TRIM(qt.codigo)) = UPPER(TRIM(qualificacoes_historico.codigo))
    AND qt.deleted_at IS NULL
  LIMIT 1
) AS TEXT)
WHERE deleted_at IS NULL 
  AND qualificacao_id IS NULL
  AND nome IS NOT NULL
  AND codigo IS NOT NULL;
"

log_success "Matching NOME+CODIGO concluído"

echo ""

# =============================================
# 3. FALLBACK: MATCHING POR NOME
# =============================================
log_info "3. Fallback: matching por NOME..."

npx wrangler d1 execute "$DB" --remote --command "
UPDATE qualificacoes_historico 
SET qualificacao_id = CAST((
  SELECT qt.id 
  FROM qualificacoes_tipos qt 
  WHERE UPPER(TRIM(qt.nome)) = UPPER(TRIM(qualificacoes_historico.nome))
    AND qt.deleted_at IS NULL
  LIMIT 1
) AS TEXT)
WHERE deleted_at IS NULL 
  AND qualificacao_id IS NULL
  AND nome IS NOT NULL;
"

log_success "Matching NOME concluído"

echo ""

# =============================================
# 4. FALLBACK: MATCHING POR CODIGO
# =============================================
log_info "4. Fallback: matching por CODIGO..."

npx wrangler d1 execute "$DB" --remote --command "
UPDATE qualificacoes_historico 
SET qualificacao_id = CAST((
  SELECT qt.id 
  FROM qualificacoes_tipos qt 
  WHERE UPPER(TRIM(qt.codigo)) = UPPER(TRIM(qualificacoes_historico.codigo))
    AND qt.deleted_at IS NULL
  LIMIT 1
) AS TEXT)
WHERE deleted_at IS NULL 
  AND qualificacao_id IS NULL
  AND codigo IS NOT NULL;
"

log_success "Matching CODIGO concluído"

echo ""

# =============================================
# 5. LIMPEZA: SOFT DELETE ÓRFÃOS FUNCIONARIO_ID
# =============================================
log_info "5. Soft delete de órfãos funcionario_id..."

npx wrangler d1 execute "$DB" --remote --command "
UPDATE qualificacoes_historico 
SET deleted_at = datetime('now'),
    observacoes = COALESCE(observacoes || ' | ', '') || 'ORFAO: funcionario_id inválido (conciliacao FASE31)'
WHERE deleted_at IS NULL 
  AND funcionario_id NOT IN (
    SELECT CAST(id AS TEXT) FROM funcionarios WHERE deleted_at IS NULL
  );
"

log_success "Órfãos funcionario_id removidos (soft delete)"

echo ""

# =============================================
# 6. ESTATÍSTICAS FINAIS
# =============================================
log_info "6. Coletando estatísticas finais..."

echo "--- DEPOIS da Conciliação ---"
npx wrangler d1 execute "$DB" --remote --command "
SELECT 
  COUNT(*) as total_registros,
  COUNT(CASE WHEN qualificacao_id IS NOT NULL THEN 1 END) as com_qualif_id,
  COUNT(CASE WHEN qualificacao_id IS NULL THEN 1 END) as sem_qualif_id,
  ROUND(100.0 * COUNT(CASE WHEN qualificacao_id IS NOT NULL THEN 1 END) / COUNT(*), 2) as percentual_sucesso
FROM qualificacoes_historico 
WHERE deleted_at IS NULL;
"

echo ""

# =============================================
# 7. CASOS NÃO RESOLVIDOS
# =============================================
log_warning "7. Identificando casos não resolvidos..."

echo "--- Registros SEM qualificacao_id (TOP 10) ---"
npx wrangler d1 execute "$DB" --remote --command "
SELECT nome, codigo, categoria, COUNT(*) as qtd 
FROM qualificacoes_historico 
WHERE deleted_at IS NULL 
  AND qualificacao_id IS NULL 
GROUP BY nome, codigo, categoria 
ORDER BY qtd DESC 
LIMIT 10;
"

echo ""

# =============================================
# 8. DUPLICATAS PERSISTENTES
# =============================================
log_info "8. Verificando duplicatas persistentes..."

echo "--- Duplicatas após conciliação ---"
npx wrangler d1 execute "$DB" --remote --command "
SELECT funcionario_id, qualificacao_id, data_conclusao, COUNT(*) as duplicatas 
FROM qualificacoes_historico 
WHERE deleted_at IS NULL 
GROUP BY funcionario_id, qualificacao_id, data_conclusao 
HAVING COUNT(*) > 1 
LIMIT 10;
"

echo ""
echo "=========================================="
echo " CONCILIAÇÃO CONCLUÍDA"
echo "=========================================="
echo ""

log_success "Relatório salvo em: $REPORTS_DIR/fase31_conciliacao_output.txt"
