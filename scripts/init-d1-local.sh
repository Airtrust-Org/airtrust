#!/usr/bin/env bash
set -euo pipefail

# Inicializar D1 local com todas as migrações aplicadas manualmente
# (contornando problemas de ordem de execução do wrangler migrations)

DB_NAME="airtrust-db-dev"
WRANGLER_CONFIG="--config wrangler.dev.toml"
MIGRATIONS_DIR="./migrations"

echo "🔄 Inicializando D1 local com migrações..."

# Listar todas migrações em ordem
MIGRATIONS=(
  "2011_criar_tabelas_base.sql"
  "2010_certificados_system.sql"
  "2012_schema_simuladores.sql"
  "2012_qualificacoes_conteudo_programatico.sql"
  "2012_criar_simuladores_base.sql"
  "2013_empresas_campos_adicionais.sql"
  "2014_corrigir_empresas_schema.sql"
  "2015_corrigir_tipos_qualificacoes_schema.sql"
  "2016_refactor_tipos_qualificacoes.sql"
  "2018_fix_rename_tables_idempotent.sql"
  "2019_fix_qualificacao_id_null.sql"
  "2020_add_empresa_config.sql"
  "2021_adicionar_indices_performance.sql"
  "2022_fix_fichas_assinatura_columns.sql"
  "2023_create_avaliacoes_manobras.sql"
  "2024_sistema_definitivo.sql"
  "2025_create_fichas_final.sql"
  "2025_fix_is_instrutor_column.sql"
  "2025_rollback_is_instrutor.sql"
  "add-critical-indexes-v5.sql"
  "add-critical-indexes-v5-deleted-only.sql"
  "add-critical-indexes-v5-safe.sql"
  "add-critical-indexes-v5-corrigido.sql"
  "add-critical-indexes-v5-ultrasafe.sql"
  "add-critical-indexes-v5-minimal.sql"
  "add-critical-indexes-v5-supersafe.sql"
  "add-performance-indexes.sql"
  "add-performance-indexes-simple.sql"
  "add-indexes-core.sql"
  "add-indexes-basic.sql"
  "performance-indexes.sql"
  "performance-indexes-v2.sql"
  "performance-indexes-v3.sql"
  "performance-indexes-qualificacoes-v1.sql"
  "indexes-min.sql"
  "corrigir-fk-certificados-qualificacoes.sql"
  "migrar-registros-orfaos-qualificacoes.sql"
  "limpeza-geral-tabelas-obsoletas.sql"
  "004_performance_indexes.sql"
)

COUNT=0
for MIG in "${MIGRATIONS[@]}"; do
  MIG_PATH="$MIGRATIONS_DIR/$MIG"
  if [ -f "$MIG_PATH" ]; then
    echo -n "  ✓ $MIG ... "
  if wrangler d1 execute $WRANGLER_CONFIG "$DB_NAME" --local --file "$MIG_PATH" >/dev/null 2>&1; then
      echo "OK"
      COUNT=$((COUNT + 1))
    else
      echo "SKIPPED (erro, continuando)"
    fi
  fi
done

echo ""
echo "========================================"
echo "✅ $COUNT migrações aplicadas"
echo "========================================"

# Verificar tabelas criadas
TABLES=$(wrangler d1 execute $WRANGLER_CONFIG "$DB_NAME" --local --command "SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name NOT LIKE '%cf_%';" 2>&1 | grep -oE '"total"[^}]*' | head -1 || echo '"total": 0')
echo "📊 Tabelas criadas: $TABLES"
