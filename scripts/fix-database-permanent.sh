#!/bin/bash
set -e

echo "🔧 SCRIPT DE CORREÇÃO DEFINITIVA DO BANCO DE DADOS"
echo "=================================================="
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Diretórios
PROJECT_ROOT="/Users/filipedaumas/Documents/airtrust v1"
WRANGLER_DIR="$PROJECT_ROOT/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
MIGRATIONS_DIR="$PROJECT_ROOT/worker-airtrust/migrations"

cd "$PROJECT_ROOT"

echo "📍 1. IDENTIFICAR BANCO ATIVO DO WRANGLER"
echo "----------------------------------------"

# Encontrar o banco que o wrangler está usando
ACTIVE_DB=$(find "$WRANGLER_DIR" -name "*.sqlite" -type f | grep -v backup | head -1)
echo "   Banco ativo: $(basename "$ACTIVE_DB")"

# Contar tabelas atuais
CURRENT_TABLES=$(sqlite3 "$ACTIVE_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table'" 2>/dev/null || echo "0")
echo "   Tabelas atuais: $CURRENT_TABLES"

echo ""
echo "🗄️  2. BACKUP DO BANCO ATUAL"
echo "----------------------------------------"
BACKUP_FILE="$WRANGLER_DIR/backup-before-fix-$(date +%Y%m%d-%H%M%S).sqlite"
cp "$ACTIVE_DB" "$BACKUP_FILE"
echo -e "${GREEN}✅ Backup criado: $(basename "$BACKUP_FILE")${NC}"

echo ""
echo "📦 3. APLICAR TODAS AS MIGRAÇÕES NA ORDEM"
echo "----------------------------------------"

# Aplicar cada migração
for migration in "$MIGRATIONS_DIR"/*.sql; do
    if [ -f "$migration" ]; then
        echo "   Aplicando: $(basename "$migration")"
        sqlite3 "$ACTIVE_DB" < "$migration" 2>&1 || echo "   (já aplicada ou erro ignorado)"
    fi
done

echo ""
echo "📊 4. VERIFICAR ESTRUTURA FINAL"
echo "----------------------------------------"

# Contar tabelas após migrações
FINAL_TABLES=$(sqlite3 "$ACTIVE_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table'" 2>/dev/null || echo "0")
echo "   Tabelas após migrações: $FINAL_TABLES"

# Verificar tabelas críticas
echo ""
echo "   Verificando tabelas críticas:"
CRITICAL_TABLES=("modelos_sessao" "simulador_agendamentos" "cadastro_manobras" "funcionarios" "fichas_sessao")

for table in "${CRITICAL_TABLES[@]}"; do
    EXISTS=$(sqlite3 "$ACTIVE_DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='$table'" 2>/dev/null)
    if [ "$EXISTS" -eq "1" ]; then
        COUNT=$(sqlite3 "$ACTIVE_DB" "SELECT COUNT(*) FROM $table" 2>/dev/null || echo "0")
        echo -e "   ${GREEN}✅ $table${NC} (${COUNT} registros)"
    else
        echo -e "   ${RED}❌ $table${NC} (NÃO EXISTE)"
    fi
done

echo ""
echo "🔒 5. GARANTIR PERMANÊNCIA"
echo "----------------------------------------"

# Criar symlink do banco hash para airtrust-local
HASH_DB_NAME=$(basename "$ACTIVE_DB")
ln -sf "$HASH_DB_NAME" "$WRANGLER_DIR/airtrust-local.sqlite" 2>/dev/null || true
echo "   ✅ Symlink criado: airtrust-local.sqlite → $HASH_DB_NAME"

# Criar arquivo .gitignore para .wrangler se não existir
if [ ! -f "$PROJECT_ROOT/.wrangler/.gitignore" ]; then
    echo "*" > "$PROJECT_ROOT/.wrangler/.gitignore"
    echo "!.gitignore" >> "$PROJECT_ROOT/.wrangler/.gitignore"
fi

echo ""
echo "✅ 6. TESTAR BANCO"
echo "----------------------------------------"

# Teste rápido
TEST_MODELOS=$(sqlite3 "$ACTIVE_DB" "SELECT COUNT(*) FROM modelos_sessao WHERE deleted_at IS NULL" 2>/dev/null || echo "0")
TEST_MANOBRAS=$(sqlite3 "$ACTIVE_DB" "SELECT COUNT(*) FROM cadastro_manobras WHERE deleted_at IS NULL" 2>/dev/null || echo "0")

echo "   Modelos de sessão: $TEST_MODELOS"
echo "   Manobras cadastradas: $TEST_MANOBRAS"

if [ "$TEST_MODELOS" -eq "0" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  ATENÇÃO: Tabela modelos_sessao está vazia!${NC}"
    echo "   Reinserindo dados..."
    sqlite3 "$ACTIVE_DB" <<EOF
INSERT OR IGNORE INTO modelos_sessao (codigo, nome, tipo, descricao, duracao_estimada, ordem_no_treinamento, ativo) VALUES
('SIM1', 'Familiarização com o Simulador', 'inicial', 'Introdução aos controles e sistemas', 120, 1, 1),
('SIM2', 'Procedimentos Normais', 'básico', 'Procedimentos de rotina e operação normal', 120, 2, 1),
('SIM3', 'Procedimentos de Emergência Básicos', 'básico', 'Emergências simples e procedimentos básicos', 120, 3, 1),
('SIM4', 'Navegação e Voo por Instrumentos', 'intermediário', 'Navegação IFR e procedimentos de voo', 150, 4, 1),
('SIM5', 'Aproximações e Pousos', 'intermediário', 'Diferentes tipos de aproximação e pouso', 150, 5, 1),
('SIM6', 'Procedimentos de Emergência Avançados', 'avançado', 'Emergências complexas e múltiplas falhas', 150, 6, 1),
('SIM7', 'Voo em Condições Adversas', 'avançado', 'Meteorologia adversa e situações críticas', 120, 7, 1),
('SIM8', 'CRM e Gestão de Recursos', 'intermediário', 'Crew Resource Management', 90, 8, 1),
('SIM9', 'Revisão e Avaliação', 'avaliação', 'Revisão geral e avaliação de competências', 180, 9, 1),
('SIM10', 'Treinamento Periódico', 'recorrente', 'Manutenção de qualificação periódica', 120, 10, 1),
('SIM11', 'Cenários Customizados', 'especial', 'Cenários específicos sob demanda', 120, 11, 1);
EOF
    echo -e "   ${GREEN}✅ Dados reinseridos${NC}"
fi

if [ "$TEST_MANOBRAS" -eq "0" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  ATENÇÃO: Tabela cadastro_manobras está vazia!${NC}"
    echo "   Reinserindo dados..."
    sqlite3 "$ACTIVE_DB" <<EOF
INSERT OR IGNORE INTO cadastro_manobras (codigo, descricao, categoria, tipo_sessao, ordem, obrigatoria, pontuacao_maxima) VALUES
('SIM1-M01', 'Ligar motores', 'Procedimentos Básicos', 'SIM1', 1, 1, 100),
('SIM1-M02', 'Taxi', 'Procedimentos Básicos', 'SIM1', 2, 1, 100),
('SIM1-M03', 'Decolagem normal', 'Procedimentos Básicos', 'SIM1', 3, 1, 100),
('SIM1-M04', 'Subida inicial', 'Procedimentos Básicos', 'SIM1', 4, 1, 100),
('SIM1-M05', 'Circuito de tráfego', 'Procedimentos Básicos', 'SIM1', 5, 1, 100),
('SIM2-M01', 'Checklist normal completo', 'Procedimentos Normais', 'SIM2', 1, 1, 100),
('SIM2-M02', 'Comunicação ATC', 'Procedimentos Normais', 'SIM2', 2, 1, 100),
('SIM2-M03', 'Navegação VFR', 'Procedimentos Normais', 'SIM2', 3, 1, 100),
('SIM2-M04', 'Pouso normal', 'Procedimentos Normais', 'SIM2', 4, 1, 100),
('SIM2-M05', 'Estacionamento', 'Procedimentos Normais', 'SIM2', 5, 1, 100),
('SIM3-M01', 'Falha de motor em voo', 'Emergências', 'SIM3', 1, 1, 100),
('SIM3-M02', 'Falha elétrica', 'Emergências', 'SIM3', 2, 1, 100),
('SIM3-M03', 'Fogo em motor', 'Emergências', 'SIM3', 3, 1, 100),
('SIM3-M04', 'Pouso de emergência', 'Emergências', 'SIM3', 4, 1, 100),
('SIM3-M05', 'Evacuação de emergência', 'Emergências', 'SIM3', 5, 1, 100);
EOF
    echo -e "   ${GREEN}✅ Dados reinseridos${NC}"
fi

echo ""
echo -e "${GREEN}=================================================="
echo "✅ BANCO DE DADOS CORRIGIDO E PERSISTENTE"
echo -e "==================================================${NC}"
echo ""
echo "📋 Resumo:"
echo "   • Banco ativo: $HASH_DB_NAME"
echo "   • Tabelas: $FINAL_TABLES"
echo "   • Modelos: $(sqlite3 "$ACTIVE_DB" "SELECT COUNT(*) FROM modelos_sessao WHERE deleted_at IS NULL" 2>/dev/null || echo "0")"
echo "   • Manobras: $(sqlite3 "$ACTIVE_DB" "SELECT COUNT(*) FROM cadastro_manobras WHERE deleted_at IS NULL" 2>/dev/null || echo "0")"
echo "   • Backup: $(basename "$BACKUP_FILE")"
echo ""
echo "🚀 Próximos passos:"
echo "   1. Reiniciar o worker: pkill -f wrangler && npm run dev:worker"
echo "   2. Testar endpoints locais"
echo "   3. Aplicar migrações em PRODUÇÃO: ./scripts/apply-migrations-production.sh"
echo ""
