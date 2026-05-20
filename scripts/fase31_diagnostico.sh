#!/bin/bash
# =============================================
# Script: Análise Completa de Conciliação de Dados
# FASE 31 - Parte 1: Diagnóstico
# Data: 2025-11-15
# =============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$PROJECT_ROOT/worker-airtrust"
REPORTS_DIR="$PROJECT_ROOT/reports"

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
echo " FASE 31 - ANÁLISE DE CONCILIAÇÃO"
echo "=========================================="
echo ""

# =============================================
# 1. VERIFICAR ESTRUTURA DAS TABELAS
# =============================================
log_info "1. Verificando estrutura das tabelas..."

echo "--- Colunas de funcionarios ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "PRAGMA table_info(funcionarios)" | grep -A 50 "│"

echo ""
echo "--- Colunas de qualificacoes_historico ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "PRAGMA table_info(qualificacoes_historico)" | grep -A 50 "│" | head -40

# =============================================
# 2. ESTATÍSTICAS ATUAIS
# =============================================
log_info "2. Coletando estatísticas atuais..."

echo ""
echo "--- Total de Registros por Tabela ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT 'funcionarios' as tabela, COUNT(*) as total FROM funcionarios WHERE deleted_at IS NULL"

npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT 'qualificacoes_tipos' as tabela, COUNT(*) as total FROM qualificacoes_tipos WHERE deleted_at IS NULL"

npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT 'qualificacoes_historico' as tabela, COUNT(*) as total FROM qualificacoes_historico WHERE deleted_at IS NULL"

echo ""
echo "--- Distribuição de Status em qualificacoes_historico ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT status, COUNT(*) as qtd FROM qualificacoes_historico WHERE deleted_at IS NULL GROUP BY status ORDER BY qtd DESC"

# =============================================
# 3. VERIFICAR INTEGRIDADE REFERENCIAL
# =============================================
log_info "3. Verificando integridade referencial..."

echo ""
echo "--- Históricos com funcionario_id NULL ou inválido ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT COUNT(*) as registros_orfaos FROM qualificacoes_historico WHERE deleted_at IS NULL AND (funcionario_id IS NULL OR funcionario_id NOT IN (SELECT id FROM funcionarios WHERE deleted_at IS NULL))"

echo ""
echo "--- Históricos com qualificacao_tipo_id NULL ou inválido ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT COUNT(*) as tipos_orfaos FROM qualificacoes_historico WHERE deleted_at IS NULL AND (qualificacao_tipo_id IS NULL OR qualificacao_tipo_id NOT IN (SELECT id FROM qualificacoes_tipos WHERE deleted_at IS NULL))"

# =============================================
# 4. VERIFICAR CAMPOS DENORMALIZADOS
# =============================================
log_info "4. Verificando campos denormalizados..."

echo ""
echo "--- Registros com campos denormalizados populados ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT 
     COUNT(*) as total,
     COUNT(CASE WHEN nome IS NOT NULL THEN 1 END) as com_nome,
     COUNT(CASE WHEN codigo IS NOT NULL THEN 1 END) as com_codigo,
     COUNT(CASE WHEN matricula IS NOT NULL THEN 1 END) as com_matricula
   FROM qualificacoes_historico 
   WHERE deleted_at IS NULL"

# =============================================
# 5. VERIFICAR DATAS INCONSISTENTES
# =============================================
log_info "5. Verificando datas inconsistentes..."

echo ""
echo "--- Registros com data_vencimento < data_conclusao ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT COUNT(*) as datas_invalidas FROM qualificacoes_historico WHERE deleted_at IS NULL AND data_vencimento IS NOT NULL AND data_conclusao IS NOT NULL AND date(data_vencimento) < date(data_conclusao)"

echo ""
echo "--- Registros sem data_conclusao ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT COUNT(*) as sem_data_conclusao FROM qualificacoes_historico WHERE deleted_at IS NULL AND data_conclusao IS NULL"

echo ""
echo "--- Registros sem data_vencimento ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT COUNT(*) as sem_data_vencimento FROM qualificacoes_historico WHERE deleted_at IS NULL AND data_vencimento IS NULL"

# =============================================
# 6. ANÁLISE DE FUNCIONÁRIOS
# =============================================
log_info "6. Analisando funcionários..."

echo ""
echo "--- Funcionários sem qualificações ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT COUNT(*) as sem_qualificacoes FROM funcionarios f WHERE f.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico qh WHERE qh.funcionario_id = f.id AND qh.deleted_at IS NULL)"

echo ""
echo "--- Funcionários com mais qualificações (TOP 5) ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT f.id, f.matricula, f.nome, COUNT(qh.id) as total_qualificacoes FROM funcionarios f INNER JOIN qualificacoes_historico qh ON qh.funcionario_id = f.id WHERE f.deleted_at IS NULL AND qh.deleted_at IS NULL GROUP BY f.id, f.matricula, f.nome ORDER BY total_qualificacoes DESC LIMIT 5"

# =============================================
# 7. ANÁLISE DE QUALIFICAÇÕES TIPOS
# =============================================
log_info "7. Analisando tipos de qualificação..."

echo ""
echo "--- Tipos de qualificação não utilizados ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT COUNT(*) as tipos_nao_utilizados FROM qualificacoes_tipos qt WHERE qt.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico qh WHERE qh.qualificacao_tipo_id = qt.id AND qh.deleted_at IS NULL)"

echo ""
echo "--- Tipos mais utilizados (TOP 10) ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT qt.id, qt.codigo, qt.nome, COUNT(qh.id) as total_usos FROM qualificacoes_tipos qt LEFT JOIN qualificacoes_historico qh ON qh.qualificacao_tipo_id = qt.id AND qh.deleted_at IS NULL WHERE qt.deleted_at IS NULL GROUP BY qt.id, qt.codigo, qt.nome ORDER BY total_usos DESC LIMIT 10"

# =============================================
# 8. VERIFICAR DUPLICATAS
# =============================================
log_info "8. Verificando possíveis duplicatas..."

echo ""
echo "--- Duplicatas de funcionario_id + qualificacao_tipo_id + data_conclusao ---"
npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT funcionario_id, qualificacao_tipo_id, data_conclusao, COUNT(*) as duplicatas FROM qualificacoes_historico WHERE deleted_at IS NULL GROUP BY funcionario_id, qualificacao_tipo_id, data_conclusao HAVING COUNT(*) > 1 LIMIT 10"

# =============================================
# 9. RESUMO FINAL
# =============================================
echo ""
echo "=========================================="
echo " RESUMO DO DIAGNÓSTICO"
echo "=========================================="

npx wrangler d1 execute airtrust-db --remote --command \
  "SELECT 
     (SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL) as funcionarios_ativos,
     (SELECT COUNT(*) FROM qualificacoes_tipos WHERE deleted_at IS NULL) as tipos_qualificacao,
     (SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL) as historico_total,
     (SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL AND status = 'MIGRADO') as status_migrado,
     (SELECT COUNT(*) FROM qualificacoes_historico WHERE deleted_at IS NULL AND qualificacao_tipo_id IS NULL) as sem_tipo_id"

echo ""
log_success "Diagnóstico completo! Relatório salvo em reports/"
