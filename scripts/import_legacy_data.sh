#!/bin/bash
# =============================================
# Script: Importar Dados Legados para Tabelas Temporárias
# Data: 2025-11-15
# Objetivo: Importar dumps históricos para legacy_* sem sobrescrever produção
# =============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$PROJECT_ROOT/worker-airtrust"
DUMPS_DIR="$PROJECT_ROOT/dumps"
BACKUPS_DIR="$PROJECT_ROOT/_backups"

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função de log
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================
# ETAPA 1: Verificar Pré-requisitos
# =============================================
log_info "Verificando pré-requisitos..."

# Verificar wrangler
if ! command -v wrangler &> /dev/null; then
    log_error "wrangler não encontrado. Instale com: npm install -g wrangler"
    exit 1
fi

# Verificar diretório worker
if [ ! -d "$WORKER_DIR" ]; then
    log_error "Diretório worker-airtrust não encontrado: $WORKER_DIR"
    exit 1
fi

# Criar diretório dumps se não existir
mkdir -p "$DUMPS_DIR"

log_success "Pré-requisitos OK"

# =============================================
# ETAPA 2: Aplicar Migration 0010 (Tabelas Legacy)
# =============================================
log_info "Aplicando migration 0010 (tabelas legacy_*)..."

cd "$WORKER_DIR"

# Verificar se migration já foi aplicada
APPLIED=$(npx wrangler d1 execute airtrust-db --remote --command \
    "SELECT name FROM sqlite_master WHERE type='table' AND name='legacy_import_log'" \
    2>/dev/null | grep -c "legacy_import_log" || echo "0")

if [ "$APPLIED" = "0" ]; then
    log_info "Aplicando migration 0010..."
    npx wrangler d1 execute airtrust-db --remote --file=migrations/0010_legacy_import_stage.sql
    log_success "Migration 0010 aplicada com sucesso"
else
    log_warning "Migration 0010 já foi aplicada anteriormente"
fi

# =============================================
# ETAPA 3: Extrair Dados de Backups Git
# =============================================
log_info "Extraindo dados de backups antigos..."

# Verificar se existe funcionarios_vencimentos_backup em commits antigos
log_info "Buscando tabela funcionarios_vencimentos_backup em commits..."

cd "$PROJECT_ROOT"

# Buscar arquivo de migration que criou a tabela
BACKUP_SQL=$(find "$BACKUPS_DIR" -name "004_criar_backup_funcionarios.sql" 2>/dev/null | head -1)

if [ -n "$BACKUP_SQL" ]; then
    log_info "Encontrado: $BACKUP_SQL"
    log_info "Este arquivo contém instruções para criar backup de funcionários"
else
    log_warning "Arquivo 004_criar_backup_funcionarios.sql não encontrado nos backups"
fi

# =============================================
# ETAPA 4: Importar CSV de Teste (se existir)
# =============================================
TEST_CSV="$PROJECT_ROOT/teste-importacao-prod.csv"

if [ -f "$TEST_CSV" ]; then
    log_info "Importando dados de teste: $TEST_CSV"
    
    BATCH_ID="BATCH_$(date +%Y%m%d_%H%M%S)"
    
    # Ler CSV e gerar INSERTs
    {
        read # pular cabeçalho
        while IFS=, read -r funcionario_id tipo codigo nome data_conclusao data_vencimento instrutor nota_final; do
            # Remover aspas se houver
            funcionario_id=$(echo "$funcionario_id" | tr -d '"')
            tipo=$(echo "$tipo" | tr -d '"')
            codigo=$(echo "$codigo" | tr -d '"')
            nome=$(echo "$nome" | tr -d '"')
            data_conclusao=$(echo "$data_conclusao" | tr -d '"')
            data_vencimento=$(echo "$data_vencimento" | tr -d '"')
            instrutor=$(echo "$instrutor" | tr -d '"')
            nota_final=$(echo "$nota_final" | tr -d '"')
            
            # Buscar matricula do funcionario_id
            MATRICULA=$(cd "$WORKER_DIR" && npx wrangler d1 execute airtrust-db --remote --command \
                "SELECT matricula FROM funcionarios WHERE id=$funcionario_id LIMIT 1" 2>/dev/null \
                | grep -oE '[0-9]{5}' | head -1 || echo "UNKNOWN")
            
            if [ "$MATRICULA" != "UNKNOWN" ]; then
                log_info "Importando: $MATRICULA - $codigo - $nome"
                
                # Inserir em legacy_qualificacoes_historico
                cd "$WORKER_DIR" && npx wrangler d1 execute airtrust-db --remote --command \
                    "INSERT INTO legacy_qualificacoes_historico (
                        matricula, codigo, qualificacao_nome, categoria,
                        data_conclusao, data_vencimento, instrutor, nota_final,
                        origem, fonte_backup
                    ) VALUES (
                        '$MATRICULA', '$codigo', '$nome', '$tipo',
                        '$data_conclusao', '$data_vencimento', '$instrutor', $nota_final,
                        'CSV_TESTE', 'teste-importacao-prod.csv'
                    )" 2>&1 | grep -v "Executing on"
            fi
        done
    } < "$TEST_CSV"
    
    log_success "Dados de teste importados"
else
    log_warning "Arquivo teste-importacao-prod.csv não encontrado"
fi

# =============================================
# ETAPA 5: Registrar Importação no Log
# =============================================
log_info "Registrando importação no log..."

cd "$WORKER_DIR"

BATCH_ID="BATCH_$(date +%Y%m%d_%H%M%S)"

npx wrangler d1 execute airtrust-db --remote --command \
    "INSERT INTO legacy_import_log (
        batch_id, fonte, tabela_destino, status, imported_by
    ) VALUES (
        '$BATCH_ID', 
        'teste-importacao-prod.csv + migrations antigas', 
        'legacy_qualificacoes_historico',
        'CONCLUIDO',
        '$(whoami)'
    )" 2>&1 | grep -v "Executing on"

log_success "Importação registrada no log"

# =============================================
# ETAPA 6: Executar Queries de Validação
# =============================================
log_info "Executando queries de validação..."

echo ""
echo "=========================================="
echo " VALIDAÇÃO 1: Tabelas Legacy Criadas"
echo "=========================================="

npx wrangler d1 execute airtrust-db --remote --command \
    "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'legacy_%' ORDER BY name"

echo ""
echo "=========================================="
echo " VALIDAÇÃO 2: Total de Registros Legacy"
echo "=========================================="

npx wrangler d1 execute airtrust-db --remote --command \
    "SELECT 
        'legacy_funcionarios' as tabela, COUNT(*) as total 
     FROM legacy_funcionarios
     UNION ALL
     SELECT 'legacy_qualificacoes_tipos', COUNT(*) 
     FROM legacy_qualificacoes_tipos
     UNION ALL
     SELECT 'legacy_qualificacoes_historico', COUNT(*) 
     FROM legacy_qualificacoes_historico"

echo ""
echo "=========================================="
echo " VALIDAÇÃO 3: Histórico Faltante (Legacy vs Atual)"
echo "=========================================="

npx wrangler d1 execute airtrust-db --remote --command \
    "SELECT COUNT(*) as total_faltante FROM v_historico_faltante"

echo ""
echo "=========================================="
echo " VALIDAÇÃO 4: Log de Importações"
echo "=========================================="

npx wrangler d1 execute airtrust-db --remote --command \
    "SELECT 
        batch_id, fonte, tabela_destino, status, 
        started_at, imported_by
     FROM legacy_import_log 
     ORDER BY started_at DESC 
     LIMIT 10"

echo ""
log_success "Script de importação concluído!"
echo ""
echo "=========================================="
echo " PRÓXIMOS PASSOS"
echo "=========================================="
echo "1. Revisar relatório: FASE30-RELATORIO-RECUPERACAO-LEGADOS.md"
echo "2. Executar queries de comparação no relatório"
echo "3. Planejar conciliação de dados faltantes"
echo "4. Criar migration 0011 para inserir dados validados em produção"
echo ""
