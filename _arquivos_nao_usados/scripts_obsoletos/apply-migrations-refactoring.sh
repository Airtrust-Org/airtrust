#!/bin/bash

# ================================================================
# APLICAR MIGRATIONS DE REFATORAÇÃO
# ================================================================
#
# Este script aplica as migrations 0105-0108 que refatoram
# completamente o sistema de importação.
#
# ATENÇÃO: Este processo irá:
# 1. Recriar tabelas (backup automático)
# 2. Migrar dados compatíveis
# 3. Aplicar novos schemas normalizados
#
# Uso:
#   ./apply-migrations-refactoring.sh [local|remote]
#
# ================================================================

set -e

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Argumentos
MODE=${1:-local}
DB_NAME="airtrust-db"

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   REFATORAÇÃO COMPLETA - SISTEMA DE IMPORTAÇÃO${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Mode:${NC} $MODE"
echo -e "${YELLOW}Database:${NC} $DB_NAME"
echo ""

# Confirmar ação
if [ "$MODE" == "remote" ]; then
  echo -e "${RED}⚠️  ATENÇÃO: Você está prestes a aplicar migrations em PRODUÇÃO!${NC}"
  echo ""
  read -p "Digite 'CONFIRMO' para continuar: " confirmation
  if [ "$confirmation" != "CONFIRMO" ]; then
    echo -e "${RED}❌ Operação cancelada${NC}"
    exit 1
  fi
fi

echo ""
echo -e "${GREEN}✓ Confirmação recebida. Iniciando processo...${NC}"
echo ""

# Função para aplicar migration
apply_migration() {
  local migration_file=$1
  local migration_name=$(basename "$migration_file" .sql)
  
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${YELLOW}Aplicando: $migration_name${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  if [ "$MODE" == "remote" ]; then
    npx wrangler d1 execute "$DB_NAME" --remote --file="$migration_file"
  else
    npx wrangler d1 execute "$DB_NAME" --local --file="$migration_file"
  fi
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ $migration_name aplicada com sucesso${NC}"
  else
    echo -e "${RED}✗ Erro ao aplicar $migration_name${NC}"
    exit 1
  fi
  
  echo ""
  sleep 1
}

# Verificar se migrations existem
MIGRATIONS_DIR="worker-airtrust/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo -e "${RED}❌ Diretório de migrations não encontrado: $MIGRATIONS_DIR${NC}"
  exit 1
fi

# Listar migrations
MIGRATIONS=(
  "$MIGRATIONS_DIR/0105_refactor_funcionarios.sql"
  "$MIGRATIONS_DIR/0106_refactor_qualificacoes_tipos.sql"
  "$MIGRATIONS_DIR/0107_refactor_qualificacoes_historico.sql"
  "$MIGRATIONS_DIR/0108_create_arquivos.sql"
)

# Verificar se todas as migrations existem
for migration in "${MIGRATIONS[@]}"; do
  if [ ! -f "$migration" ]; then
    echo -e "${RED}❌ Migration não encontrada: $migration${NC}"
    exit 1
  fi
done

echo -e "${GREEN}✓ Todas as migrations encontradas${NC}"
echo ""

# Aplicar migrations em ordem
for migration in "${MIGRATIONS[@]}"; do
  apply_migration "$migration"
done

# Validações pós-migration
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Validando estrutura do banco...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Validar funcionarios
echo -e "${YELLOW}Tabela funcionarios:${NC}"
if [ "$MODE" == "remote" ]; then
  npx wrangler d1 execute "$DB_NAME" --remote --command="PRAGMA table_info('funcionarios')"
else
  npx wrangler d1 execute "$DB_NAME" --local --command="PRAGMA table_info('funcionarios')"
fi
echo ""

# Validar qualificacoes_tipos
echo -e "${YELLOW}Tabela qualificacoes_tipos:${NC}"
if [ "$MODE" == "remote" ]; then
  npx wrangler d1 execute "$DB_NAME" --remote --command="PRAGMA table_info('qualificacoes_tipos')"
else
  npx wrangler d1 execute "$DB_NAME" --local --command="PRAGMA table_info('qualificacoes_tipos')"
fi
echo ""

# Validar qualificacoes_historico
echo -e "${YELLOW}Tabela qualificacoes_historico:${NC}"
if [ "$MODE" == "remote" ]; then
  npx wrangler d1 execute "$DB_NAME" --remote --command="PRAGMA table_info('qualificacoes_historico')"
else
  npx wrangler d1 execute "$DB_NAME" --local --command="PRAGMA table_info('qualificacoes_historico')"
fi
echo ""

# Validar arquivos
echo -e "${YELLOW}Tabela arquivos:${NC}"
if [ "$MODE" == "remote" ]; then
  npx wrangler d1 execute "$DB_NAME" --remote --command="PRAGMA table_info('arquivos')"
else
  npx wrangler d1 execute "$DB_NAME" --local --command="PRAGMA table_info('arquivos')"
fi
echo ""

# Contagem de registros migrados
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Contagem de registros migrados:${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if [ "$MODE" == "remote" ]; then
  echo -e "${YELLOW}Funcionários:${NC}"
  npx wrangler d1 execute "$DB_NAME" --remote --command="SELECT COUNT(*) as total FROM funcionarios"
  echo ""
  
  echo -e "${YELLOW}Tipos de Qualificação:${NC}"
  npx wrangler d1 execute "$DB_NAME" --remote --command="SELECT COUNT(*) as total FROM qualificacoes_tipos"
  echo ""
  
  echo -e "${YELLOW}Histórico de Qualificações:${NC}"
  npx wrangler d1 execute "$DB_NAME" --remote --command="SELECT COUNT(*) as total FROM qualificacoes_historico"
  echo ""
else
  echo -e "${YELLOW}Funcionários:${NC}"
  npx wrangler d1 execute "$DB_NAME" --local --command="SELECT COUNT(*) as total FROM funcionarios"
  echo ""
  
  echo -e "${YELLOW}Tipos de Qualificação:${NC}"
  npx wrangler d1 execute "$DB_NAME" --local --command="SELECT COUNT(*) as total FROM qualificacoes_tipos"
  echo ""
  
  echo -e "${YELLOW}Histórico de Qualificações:${NC}"
  npx wrangler d1 execute "$DB_NAME" --local --command="SELECT COUNT(*) as total FROM qualificacoes_historico"
  echo ""
fi

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ REFATORAÇÃO CONCLUÍDA COM SUCESSO!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}Próximos passos:${NC}"
echo "1. Testar importação de funcionários (CSV/XLSX)"
echo "2. Testar importação de tipos (CSV/XLSX)"
echo "3. Testar importação de histórico com validação de FKs"
echo "4. Validar queries com JOIN"
echo ""
echo -e "${GREEN}Documentação: docs/REFACTORING_IMPORTACAO.md${NC}"
echo ""
