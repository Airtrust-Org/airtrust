#!/usr/bin/env bash
# source_reference: scripts/schema-local.sql and the versioned migrations listed below.
# operational_decision: local-only fail-closed bootstrap; remote D1/R2 targets are prohibited.
# dry_run_required: false; every wrangler invocation is explicitly constrained by --local.
# rollback_plan_required: remove worker-airtrust/.wrangler/state and rerun with --reset.
# ============================================================
# setup-local-db.sh — Inicializa banco D1 LOCAL para dev
#
# Uso:  npm run setup:local
#       bash scripts/setup-local-db.sh [--reset]
#
# --reset  apaga o banco local antes de recriar (limpa tudo)
#
# Estratégia:
#   1. Aplica scripts/schema-local.sql somente em banco novo
#   2. Aplica migrations locais exigidas pelo app atual
#   3. Registra cada migration somente após execução bem-sucedida
#   4. Valida contratos mínimos antes de aplicar seeds sintéticos
# ============================================================
set -euo pipefail

if [[ -d "/opt/homebrew/opt/node@22/bin" ]]; then
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
DEV_CONFIG="$WORKER_DIR/wrangler.dev.toml"
SCHEMA_FILE="$SCRIPT_DIR/schema-local.sql"
SEED_FILE="$WORKER_DIR/seeds/dev-seed.sql"
OVERRIDES_FILE="$SCRIPT_DIR/setup-local-overrides.sql"
CONTROLE_VOOS_SEED_FILE="$SCRIPT_DIR/seed-local-controle-voos.sql"
DB_NAME="airtrust-db-local"
LOCAL_STATE_DIR="$WORKER_DIR/.wrangler/state"
APP_MIGRATIONS=(
  "$WORKER_DIR/migrations/0289_security_rate_limit_and_token_blocklist.sql"
  "$WORKER_DIR/migrations/0320_treinamentos_convocacao_email.sql"
  "$WORKER_DIR/migrations/0332_create_audit_logs_compatible.sql"
  "$WORKER_DIR/migrations/0335_lms_cursos.sql"
  "$WORKER_DIR/migrations/0336_lms_matriculas.sql"
  "$WORKER_DIR/migrations/0337_lms_progresso_scorm.sql"
  "$WORKER_DIR/migrations/0338_lms_indexes.sql"
  "$WORKER_DIR/migrations/0339_lms_h5p_xapi.sql"
  "$WORKER_DIR/migrations/0340_lms_cursos_ead_metadata.sql"
  "$WORKER_DIR/migrations/0341_lms_pdf_pptx.sql"
  "$WORKER_DIR/migrations/0342_lms_historico_legado_edapp.sql"
  "$WORKER_DIR/migrations/0343_requisitos_compliance.sql"
  "$WORKER_DIR/migrations/0344_qualificacoes_historico_lms_rastreabilidade.sql"
  "$WORKER_DIR/migrations/0345_solicitacoes_treinamento_lms_link.sql"
  "$WORKER_DIR/migrations/0346_lms_matricula_ciclos_ssot.sql"
  "$WORKER_DIR/migrations/0347_lms_cursos_content_filename.sql"
  "$WORKER_DIR/migrations/0360_matriz_treinamento_funcao.sql"
  "$WORKER_DIR/migrations/0389_platform_roles_support_access_foundation.sql"
  # 0390_training_class_management.sql é incompatível com o snapshot local
  # versionado e não pertence ao contrato mínimo deste bootstrap.
  "$WORKER_DIR/migrations/0394_tenant_scope_catalogos_f5.sql"
  "$WORKER_DIR/migrations/0413_notechs_categoria_itens.sql"
  "$WORKER_DIR/migrations/0414_add_manobras_referencias_json.sql"
)
CONTROLE_VOOS_MIGRATIONS=(
  "$WORKER_DIR/migrations/0410_controle_voos_n1_schema.sql"
)

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✓${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || error "Node.js não encontrado"
command -v npx >/dev/null 2>&1 || error "npx não encontrado"
command -v sqlite3 >/dev/null 2>&1 || error "sqlite3 não encontrado (brew install sqlite)"

[[ -f "$DEV_CONFIG" ]] || error "wrangler.dev.toml não encontrado em $WORKER_DIR"
[[ -f "$SCHEMA_FILE" ]] || error "schema-local.sql não encontrado em $SCRIPT_DIR"
[[ -f "$SEED_FILE" ]] || error "seed sintético não encontrado em $SEED_FILE"
[[ -f "$CONTROLE_VOOS_SEED_FILE" ]] || error "seed-local-controle-voos.sql não encontrado em $SCRIPT_DIR"

for migration_file in "${APP_MIGRATIONS[@]}" "${CONTROLE_VOOS_MIGRATIONS[@]}"; do
  [[ -f "$migration_file" ]] || error "Migration não encontrada: $migration_file"
done

if [[ "${1:-}" == "--reset" ]] || [[ ! -d "$LOCAL_STATE_DIR" ]]; then
  if [[ -d "$LOCAL_STATE_DIR" ]]; then
    warn "Apagando banco local existente..."
  fi
  rm -rf "$LOCAL_STATE_DIR"
fi

echo ""
echo "============================================================"
echo "  AirTrust — Setup do banco local de desenvolvimento"
echo "  Banco: $DB_NAME  (D1 local / SQLite)"
echo "============================================================"
echo ""

cd "$ROOT_DIR"

list_local_sqlites() {
  local database_dir="$LOCAL_STATE_DIR/v3/d1/miniflare-D1DatabaseObject"
  [[ -d "$database_dir" ]] || return 0
  find "$database_dir" -type f -name "*.sqlite" ! -name "*-shm" ! -name "*-wal" -print 2>/dev/null | sort
}

find_local_sqlite() {
  local candidate
  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    if sqlite3 "$candidate"       "SELECT CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='d1_migrations') THEN 1 ELSE 0 END;"       2>/dev/null | grep -qx '1'; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done < <(list_local_sqlites)
}

has_any_local_sqlite() {
  local candidate
  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] && return 0
  done < <(list_local_sqlites)
  return 1
}

apply_local_schema() {
  info "Aplicando schema local versionado..."
  if ! npx wrangler d1 execute "$DB_NAME" \
      --config "$DEV_CONFIG" \
      --local \
      --file "$SCHEMA_FILE"; then
    error "Falha ao aplicar schema local. O setup foi interrompido para evitar banco parcial."
  fi
  success "Schema aplicado"
}

SQLITE_FILE="$(find_local_sqlite)"
if [[ -n "$SQLITE_FILE" ]]; then
  info "Banco local existente encontrado; schema base não será reaplicado"
elif has_any_local_sqlite; then
  error "Estado D1 local ambíguo: nenhum SQLite persistido contém d1_migrations. Execute npm run setup:local:reset."
else
  apply_local_schema
  SQLITE_FILE="$(find_local_sqlite)"
fi

[[ -n "$SQLITE_FILE" ]] || error "Arquivo SQLite local não encontrado após aplicar schema"

require_sqlite_table() {
  local table_name="$1"
  local total
  total="$(sqlite3 "$SQLITE_FILE" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='$table_name';")"
  [[ "$total" == "1" ]] || error "Contrato do schema local inválido: tabela ausente $table_name. Execute npm run setup:local:reset."
}

require_sqlite_column() {
  local table_name="$1"
  local column_name="$2"
  sqlite3 "$SQLITE_FILE" "PRAGMA table_info($table_name);" | awk -F'|' '{ print $2 }' | grep -qx "$column_name" \
    || error "Contrato do schema local inválido: coluna ausente $table_name.$column_name. Execute npm run setup:local:reset."
}

ensure_sqlite_column() {
  local table_name="$1"
  local column_name="$2"
  local column_definition="$3"

  require_sqlite_table "$table_name"
  if ! sqlite3 "$SQLITE_FILE" "PRAGMA table_info($table_name);" | awk -F'|' '{ print $2 }' | grep -qx "$column_name"; then
    sqlite3 "$SQLITE_FILE" "ALTER TABLE $table_name ADD COLUMN $column_name $column_definition;"
  fi
}

ensure_0340_qualificacoes_tipos_compat() {
  ensure_sqlite_column "qualificacoes_tipos" "conteudo_programatico" "TEXT DEFAULT NULL"
  ensure_sqlite_column "qualificacoes_tipos" "carga_horaria_inicial" "REAL CHECK(carga_horaria_inicial IS NULL OR carga_horaria_inicial > 0)"
  ensure_sqlite_column "qualificacoes_tipos" "carga_horaria_recorrente" "REAL CHECK(carga_horaria_recorrente IS NULL OR carga_horaria_recorrente > 0)"
}

migration_recorded() {
  local migration_name="$1"
  [[ "$(sqlite3 "$SQLITE_FILE" "SELECT COUNT(*) FROM d1_migrations WHERE name='$migration_name';")" == "1" ]]
}

require_migration_recorded() {
  local migration_name="$1"
  migration_recorded "$migration_name" \
    || error "Ledger local sem migration aplicada com sucesso: $migration_name"
}

record_local_migration() {
  local migration_name="$1"
  sqlite3 "$SQLITE_FILE" \
    "INSERT INTO d1_migrations (name) VALUES ('$migration_name');"
}

apply_local_migration() {
  local migration_file="$1"
  local migration_name
  migration_name="$(basename "$migration_file")"

  if migration_recorded "$migration_name"; then
    info "Migration já registrada: $migration_name"
    return 0
  fi

  if [[ "$migration_name" == "0340_lms_cursos_ead_metadata.sql" ]]; then
    info "Garantindo compatibilidade local de qualificacoes_tipos antes da 0340 LMS..."
    ensure_0340_qualificacoes_tipos_compat
  fi

  if ! npx wrangler d1 execute "$DB_NAME" \
      --config "$DEV_CONFIG" \
      --local \
      --file "$migration_file"; then
    error "Migration falhou: $migration_name. O ledger local não foi alterado."
  fi

  record_local_migration "$migration_name"
  success "Migration aplicada: $migration_name"
}

for table_name in d1_migrations empresas funcionarios manobras manobras_categorias; do
  require_sqlite_table "$table_name"
done
require_sqlite_column "d1_migrations" "name"

info "Aplicando migrations incrementais do app..."
for migration_file in "${APP_MIGRATIONS[@]}"; do
  apply_local_migration "$migration_file"
done

info "Aplicando migrations incrementais do Controle de Voos..."
for migration_file in "${CONTROLE_VOOS_MIGRATIONS[@]}"; do
  apply_local_migration "$migration_file"
done

for migration_file in "${APP_MIGRATIONS[@]}" "${CONTROLE_VOOS_MIGRATIONS[@]}"; do
  require_migration_recorded "$(basename "$migration_file")"
done

for table_name in audit_logs lms_cursos lms_matriculas lms_progresso_scorm cv_voos notechs_categorias notechs_itens; do
  require_sqlite_table "$table_name"
done

for column_name in empresa_id usuario_id acao tabela registro_id created_at; do
  require_sqlite_column "audit_logs" "$column_name"
done
require_sqlite_column "lms_cursos" "conteudo_arquivo_nome"
require_sqlite_column "manobras" "referencias_json"
require_sqlite_table "frms_jornada"
for column_name in empresa_id hora_dormiu hora_acordou sono_efetivo_min fonte_sono; do
  require_sqlite_column "frms_jornada" "$column_name"
done

info "Aplicando seed sintético de desenvolvimento..."
if sqlite3 "$SQLITE_FILE" < "$SEED_FILE" 2>/dev/null; then
  success "Seed aplicado"
else
  warn "Seed parcialmente aplicado (alguns registros já existiam — normal em re-runs)"
fi

info "Aplicando seed mínimo de Controle de Voos..."
if sqlite3 "$SQLITE_FILE" < "$CONTROLE_VOOS_SEED_FILE" 2>/dev/null; then
  success "Seed de Controle de Voos aplicado"
else
  warn "Seed de Controle de Voos aplicado com avisos"
fi

if [[ -f "$OVERRIDES_FILE" ]]; then
  info "Aplicando overrides locais..."
  if sqlite3 "$SQLITE_FILE" < "$OVERRIDES_FILE" 2>/dev/null; then
    success "Overrides locais aplicados"
  else
    warn "Overrides locais aplicados com avisos"
  fi
fi

echo ""
info "Verificando banco..."

TABLE_COUNT=$(sqlite3 "$SQLITE_FILE" \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%';")

EMPRESA_COUNT=$(sqlite3 "$SQLITE_FILE" \
  "SELECT COUNT(*) FROM empresas WHERE deleted_at IS NULL;")

FUNCIONARIO_COUNT=$(sqlite3 "$SQLITE_FILE" \
  "SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL;")

CV_TABLE_COUNT=$(sqlite3 "$SQLITE_FILE" \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'cv_%';")

CV_FLIGHT_COUNT=$(sqlite3 "$SQLITE_FILE" \
  "SELECT COUNT(*) FROM cv_voos WHERE deleted_at IS NULL;")

echo ""
echo "============================================================"
success "Banco local pronto!"
echo ""
echo "  Tabelas     : $TABLE_COUNT"
echo "  Empresas    : $EMPRESA_COUNT"
echo "  Funcionários: $FUNCIONARIO_COUNT"
echo "  Tabelas cv_*: $CV_TABLE_COUNT"
echo "  Voos N1     : $CV_FLIGHT_COUNT"
echo ""
echo "  Login master: filipe.daumas@icloud.com  /  senha: Davi@1979air"
echo "  Login legado : admin@dev.local  /  senha: Admin@123"
echo ""
echo "  Para iniciar o worker local:"
echo "    npm run dev:worker:safe"
echo ""
echo "  Para iniciar tudo (worker + frontend):"
echo "    npm run dev:safe"
echo ""
echo "  Para recriar do zero:"
echo "    npm run setup:local:reset"
echo "============================================================"
echo ""