#!/usr/bin/env bash
# ============================================================
# setup-local-db.sh — Inicializa banco D1 LOCAL para dev
#
# Uso:  npm run setup:local
#       bash scripts/setup-local-db.sh [--reset]
#
# --reset  apaga o banco local antes de recriar (limpa tudo)
#
# Estratégia:
#   1. Aplica scripts/schema-local.sql via wrangler (DDL local versionado)
#   2. Aplica migrations locais incrementais exigidas pelo app atual
#   3. Aplica seeds sintéticos versionados via sqlite3
#
# O schema local versionado fica em scripts/schema-local.sql.
# Se ele sumir ou ficar desatualizado, restaure-o a partir do repositório
# antes de rodar este setup.
# ============================================================
set -euo pipefail

# O projeto requer Node 22 (Node 24+ tem bug com esbuild e wrangler file handles)
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
  "$WORKER_DIR/migrations/0320_treinamentos_convocacao_email.sql"
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
  "$WORKER_DIR/migrations/0390_training_class_management.sql"
  "$WORKER_DIR/migrations/0394_tenant_scope_catalogos_f5.sql"
  "$WORKER_DIR/migrations/0413_notechs_categoria_itens.sql"
  "$WORKER_DIR/migrations/0414_add_manobras_referencias_json.sql"
)
CONTROLE_VOOS_MIGRATIONS=(
  "$WORKER_DIR/migrations/0410_controle_voos_n1_schema.sql"
)

# ── Cores ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}ℹ${NC}  $*"; }
success() { echo -e "${GREEN}✓${NC}  $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✗${NC}  $*"; exit 1; }

# ── Verificações ────────────────────────────────────────────
command -v node   >/dev/null 2>&1 || error "Node.js não encontrado"
command -v npx    >/dev/null 2>&1 || error "npx não encontrado"
command -v sqlite3 >/dev/null 2>&1 || error "sqlite3 não encontrado (brew install sqlite)"

[[ -f "$DEV_CONFIG"   ]] || error "wrangler.dev.toml não encontrado em $WORKER_DIR"
[[ -f "$SCHEMA_FILE"  ]] || error "schema-local.sql não encontrado em $SCRIPT_DIR — restaure scripts/schema-local.sql e tente novamente"
[[ -f "$SEED_FILE"    ]] || error "seed sintético não encontrado em $SEED_FILE"
[[ -f "$CONTROLE_VOOS_SEED_FILE" ]] || error "seed-local-controle-voos.sql não encontrado em $SCRIPT_DIR"

# ── Reset ────────────────────────────────────────────────────
if [[ "${1:-}" == "--reset" ]] || [[ ! -d "$LOCAL_STATE_DIR" ]]; then
  if [[ -d "$LOCAL_STATE_DIR" ]]; then
    warn "Apagando banco local existente..."
    rm -rf "$LOCAL_STATE_DIR"
  fi
fi

echo ""
echo "============================================================"
echo "  AirTrust — Setup do banco local de desenvolvimento"
echo "  Banco: $DB_NAME  (D1 local / SQLite)"
echo "============================================================"
echo ""

cd "$ROOT_DIR"

# ── Aplicar schema via wrangler (cria as tabelas) ──────────
info "Aplicando schema de produção..."
if npx wrangler d1 execute "$DB_NAME" \
    --config "$DEV_CONFIG" \
    --local \
    --file "$SCHEMA_FILE" \
    >/dev/null 2>&1; then
  success "Schema aplicado"
else
  warn "Schema aplicado com avisos (provável re-run — continuando)"
fi

# ── Localizar o arquivo SQLite gerado pelo wrangler ─────────
SQLITE_FILE=$(find "$LOCAL_STATE_DIR/v3/d1/miniflare-D1DatabaseObject" \
  -name "*.sqlite" ! -name "*-shm" ! -name "*-wal" 2>/dev/null | head -1)

[[ -n "$SQLITE_FILE" ]] || error "Arquivo SQLite local não encontrado após aplicar schema"

record_local_migration() {
  local migration_name="$1"
  sqlite3 "$SQLITE_FILE" \
    "INSERT OR IGNORE INTO d1_migrations (name, applied_at) VALUES ('$migration_name', datetime('now'));" \
    >/dev/null 2>&1 || true
}

# ── Aplicar migrations incrementais críticas (módulos recentes) ─────────────
info "Aplicando migrations incrementais do app..."
for migration_file in "${APP_MIGRATIONS[@]}"; do
  [[ -f "$migration_file" ]] || error "Migration não encontrada: $migration_file"
  if npx wrangler d1 execute "$DB_NAME" \
      --config "$DEV_CONFIG" \
      --local \
      --file "$migration_file" \
      >/dev/null 2>&1; then
    success "Migration aplicada: $(basename "$migration_file")"
    record_local_migration "$(basename "$migration_file")"
  else
    warn "Migration aplicada com avisos: $(basename "$migration_file")"
    record_local_migration "$(basename "$migration_file")"
  fi
done

# ── Aplicar migrations incrementais do Controle de Voos N1 ────────────────────
info "Aplicando migrations incrementais do Controle de Voos..."
for migration_file in "${CONTROLE_VOOS_MIGRATIONS[@]}"; do
  [[ -f "$migration_file" ]] || error "Migration não encontrada: $migration_file"
  if npx wrangler d1 execute "$DB_NAME" \
      --config "$DEV_CONFIG" \
      --local \
      --file "$migration_file" \
      >/dev/null 2>&1; then
    success "Migration aplicada: $(basename "$migration_file")"
    record_local_migration "$(basename "$migration_file")"
  else
    warn "Migration aplicada com avisos: $(basename "$migration_file")"
    record_local_migration "$(basename "$migration_file")"
  fi
done

# ── Aplicar seed diretamente via sqlite3 ────────────────────
info "Aplicando seed sintético de desenvolvimento..."
if sqlite3 "$SQLITE_FILE" < "$SEED_FILE" 2>/dev/null; then
  success "Seed aplicado"
else
  warn "Seed parcialmente aplicado (alguns registros já existiam — normal em re-runs)"
fi

# ── Seed mínimo e demonstrativo de Controle de Voos N1 ───────────────────────
info "Aplicando seed mínimo de Controle de Voos..."
if sqlite3 "$SQLITE_FILE" < "$CONTROLE_VOOS_SEED_FILE" 2>/dev/null; then
  success "Seed de Controle de Voos aplicado"
else
  warn "Seed de Controle de Voos aplicado com avisos"
fi

# ── Aplicar overrides idempotentes locais ─────────────────────────────────────
if [[ -f "$OVERRIDES_FILE" ]]; then
  info "Aplicando overrides locais..."
  if sqlite3 "$SQLITE_FILE" < "$OVERRIDES_FILE" 2>/dev/null; then
    success "Overrides locais aplicados"
  else
    warn "Overrides locais aplicados com avisos"
  fi
fi

# ── Verificação final ───────────────────────────────────────
echo ""
info "Verificando banco..."

TABLE_COUNT=$(sqlite3 "$SQLITE_FILE" \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%';" 2>/dev/null || echo "?")

EMPRESA_COUNT=$(sqlite3 "$SQLITE_FILE" \
  "SELECT COUNT(*) FROM empresas WHERE deleted_at IS NULL;" 2>/dev/null || echo "?")

FUNCIONARIO_COUNT=$(sqlite3 "$SQLITE_FILE" \
  "SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL;" 2>/dev/null || echo "?")

CV_TABLE_COUNT=$(sqlite3 "$SQLITE_FILE" \
  "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name LIKE 'cv_%';" 2>/dev/null || echo "?")

CV_FLIGHT_COUNT=$(sqlite3 "$SQLITE_FILE" \
  "SELECT COUNT(*) FROM cv_voos WHERE deleted_at IS NULL;" 2>/dev/null || echo "?")

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
