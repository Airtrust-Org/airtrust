#!/usr/bin/env bash
# source_reference: scripts/schema-local.sql and the versioned LMS migrations listed below.
# operational_decision: local-only fail-closed bootstrap; remote D1/R2 targets are prohibited.
# dry_run_required: false; every wrangler invocation is explicitly constrained by --local.
# rollback_plan_required: remove worker-airtrust/.wrangler/state and rerun with --reset.

set -euo pipefail

if [[ -d "/opt/homebrew/opt/node@22/bin" ]]; then
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
DEV_CONFIG="$WORKER_DIR/wrangler.dev.toml"
SCHEMA_FILE="$SCRIPT_DIR/schema-local.sql"
SEED_FILE="$SCRIPT_DIR/seed-local-lms-smoke.sql"
DB_NAME="airtrust-db-local"
LOCAL_STATE_DIR="$WORKER_DIR/.wrangler/state"
LMS_MIGRATIONS=(
  # Auth prerequisite for normal bearer access used by the LMS smoke.
  "$WORKER_DIR/migrations/0289_security_rate_limit_and_token_blocklist.sql"
  "$WORKER_DIR/migrations/0320_treinamentos_convocacao_email.sql"
  # completeLmsMatricula grava audit_logs no mesmo db.batch() da conclusão.
  # O snapshot local não possui essa tabela; ela deve ser criada antes do smoke.
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
  "$WORKER_DIR/migrations/0349_lms_matriculas_ultimo_slide.sql"
  "$WORKER_DIR/migrations/0350_lms_composite_deleted_at_indexes.sql"
  "$WORKER_DIR/migrations/0360_matriz_treinamento_funcao.sql"
  "$WORKER_DIR/migrations/0389_platform_roles_support_access_foundation.sql"
  # 0390_training_class_management.sql é incompatível com o snapshot local
  # versionado e não é necessário para o fluxo LMS coberto por este smoke.
  "$WORKER_DIR/migrations/0407_qualificacoes_tipos_setores.sql"
  "$WORKER_DIR/migrations/0408_lms_cursos_setores.sql"
  "$WORKER_DIR/migrations/0409_lms_cursos_setores_backfill.sql"
  # Modern additive LMS surfaces exercised by current runtime. These are safe
  # to apply on the isolated local smoke DB and keep the smoke schema closer
  # to the governed production contract without replaying the historical chain.
  "$WORKER_DIR/migrations/0456_lms_h5p_course_binding.sql"
  "$WORKER_DIR/migrations/0465_lms_scorm_package_quality_gate_v1.sql"
  "$WORKER_DIR/migrations/0469_lms_completion_pendencias_snapshots.sql"
  "$WORKER_DIR/migrations/0470_certificado_validacao_hash_index.sql"
)

error() {
  printf 'setup:lms:local: %s\n' "$*" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || error "Node.js not found"
command -v npx >/dev/null 2>&1 || error "npx not found"
command -v sqlite3 >/dev/null 2>&1 || error "sqlite3 not found"

[[ -f "$DEV_CONFIG" ]] || error "wrangler.dev.toml not found in $WORKER_DIR"
[[ -f "$SCHEMA_FILE" ]] || error "schema-local.sql not found in $SCRIPT_DIR"
[[ -f "$SEED_FILE" ]] || error "seed-local-lms-smoke.sql not found in $SCRIPT_DIR"

for migration_file in "${LMS_MIGRATIONS[@]}"; do
  [[ -f "$migration_file" ]] || error "migration not found: $migration_file"
done

if [[ "${1:-}" == "--reset" ]] || [[ ! -d "$LOCAL_STATE_DIR" ]]; then
  rm -rf "$LOCAL_STATE_DIR"
fi

cd "$ROOT_DIR"

list_local_sqlites() {
  local database_dir="$LOCAL_STATE_DIR/v3/d1/miniflare-D1DatabaseObject"
  [[ -d "$database_dir" ]] || return 0
  find "$database_dir" -type f -name "*.sqlite" ! -name "*-shm" ! -name "*-wal" -print 2>/dev/null | sort
}

find_local_sqlite() {
  local candidate
  local selected=""
  local matches=0
  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] || continue
    if sqlite3 "$candidate" \
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='d1_migrations') THEN 1 ELSE 0 END;" \
      2>/dev/null | grep -qx '1'; then
      selected="$candidate"
      matches=$((matches + 1))
    fi
  done < <(list_local_sqlites)

  if (( matches > 1 )); then
    error "ambiguous local D1 state: multiple persisted SQLite files contain d1_migrations; rerun with --reset"
  fi
  if (( matches == 1 )); then
    printf '%s\n' "$selected"
  fi
}

has_any_local_sqlite() {
  local candidate
  while IFS= read -r candidate; do
    [[ -n "$candidate" ]] && return 0
  done < <(list_local_sqlites)
  return 1
}

apply_local_schema() {
  printf 'setup:lms:local: applying versioned local schema\n'
  if ! npx wrangler d1 execute "$DB_NAME" \
    --config "$DEV_CONFIG" \
    --local \
    --file "$SCHEMA_FILE"; then
    error "base schema apply failed; refusing to continue with a partial smoke database"
  fi
}

SQLITE_FILE="$(find_local_sqlite)"
if [[ -n "$SQLITE_FILE" ]]; then
  printf 'setup:lms:local: existing local database found; base schema not reapplied\n'
elif has_any_local_sqlite; then
  error "ambiguous local D1 state: no persisted SQLite contains d1_migrations; rerun with --reset"
else
  apply_local_schema
  SQLITE_FILE="$(find_local_sqlite)"
fi

[[ -n "$SQLITE_FILE" ]] || error "local SQLite file not found after schema apply"

require_sqlite_table() {
  local table_name="$1"
  local total
  total="$(sqlite3 "$SQLITE_FILE" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='$table_name';")"
  [[ "$total" == "1" ]] || error "schema contract missing table $table_name; rerun with --reset"
}

require_sqlite_column() {
  local table_name="$1"
  local column_name="$2"
  sqlite3 "$SQLITE_FILE" "PRAGMA table_info($table_name);" | awk -F'|' '{ print $2 }' | grep -qx "$column_name" \
    || error "schema contract missing column $table_name.$column_name; rerun with --reset"
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

migration_recorded() {
  local migration_name="$1"
  [[ "$(sqlite3 "$SQLITE_FILE" "SELECT COUNT(*) FROM d1_migrations WHERE name='$migration_name';")" == "1" ]]
}

require_migration_recorded() {
  local migration_name="$1"
  migration_recorded "$migration_name" \
    || error "local migration ledger missing successful migration: $migration_name"
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
    printf 'setup:lms:local: migration already recorded: %s\n' "$migration_name"
    return 0
  fi

  if ! npx wrangler d1 execute "$DB_NAME" \
    --config "$DEV_CONFIG" \
    --local \
    --file "$migration_file"; then
    error "migration failed: $migration_name; local ledger was not updated"
  fi

  record_local_migration "$migration_name"
  printf 'setup:lms:local: migration applied: %s\n' "$migration_name"
}

for table_name in d1_migrations empresas setores qualificacoes_tipos qualificacoes_historico qualificacoes_categorias; do
  require_sqlite_table "$table_name"
done
require_sqlite_column "d1_migrations" "name"

printf 'setup:lms:local: ensuring local LMS metadata columns\n'
ensure_sqlite_column "qualificacoes_tipos" "conteudo_programatico" "TEXT"
ensure_sqlite_column "qualificacoes_tipos" "carga_horaria_inicial" "REAL"
ensure_sqlite_column "qualificacoes_tipos" "carga_horaria_recorrente" "REAL"
ensure_sqlite_column "qualificacoes_historico" "renovacao_de" "INTEGER DEFAULT NULL"
ensure_sqlite_column "empresas" "operational_domain_rbac_enabled" "INTEGER NOT NULL DEFAULT 0"
ensure_sqlite_column "qualificacoes_categorias" "dominio_codigo" "TEXT"
ensure_sqlite_column "qualificacoes_categorias" "empresa_id" "INTEGER REFERENCES empresas(id)"
ensure_sqlite_column "qualificacoes_tipos" "categoria_id" "INTEGER REFERENCES qualificacoes_categorias(id)"
ensure_sqlite_column "qualificacoes_tipos" "dominio_codigo" "TEXT"

printf 'setup:lms:local: ensuring local qualificacoes formatos bootstrap\n'
sqlite3 "$SQLITE_FILE" <<'SQL'
CREATE TABLE IF NOT EXISTS qualificacoes_formatos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  codigo TEXT NOT NULL,
  descricao TEXT,
  cor TEXT DEFAULT '#6B7280',
  ativo INTEGER NOT NULL DEFAULT 1 CHECK(ativo IN (0,1)),
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  deleted_at DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_formatos_empresa_codigo_active
  ON qualificacoes_formatos(empresa_id, codigo)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_formatos_empresa
  ON qualificacoes_formatos(empresa_id, ativo)
  WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO qualificacoes_formatos (nome, codigo, descricao, empresa_id, created_at, updated_at)
VALUES
  (
    'EAD',
    'EAD',
    'Treinamento a distância (EAD/e-learning). Vinculado ao LMS nativo.',
    6,
    datetime('now'),
    datetime('now')
  ),
  (
    'Não classificado',
    'NAO_CLASSIFICADO',
    'Formato ainda não atribuído. Reclassificar conforme evidência do dado.',
    6,
    datetime('now'),
    datetime('now')
  );

INSERT OR IGNORE INTO qualificacoes_formatos (nome, codigo, descricao, empresa_id, created_at, updated_at)
SELECT DISTINCT
  'EAD',
  'EAD',
  'Treinamento a distância (EAD/e-learning). Vinculado ao LMS nativo.',
  empresa_id,
  datetime('now'),
  datetime('now')
FROM qualificacoes_tipos
WHERE deleted_at IS NULL;

INSERT OR IGNORE INTO qualificacoes_formatos (nome, codigo, descricao, empresa_id, created_at, updated_at)
SELECT DISTINCT
  'Não classificado',
  'NAO_CLASSIFICADO',
  'Formato ainda não atribuído. Reclassificar conforme evidência do dado.',
  empresa_id,
  datetime('now'),
  datetime('now')
FROM qualificacoes_tipos
WHERE deleted_at IS NULL;
SQL

ensure_sqlite_column "qualificacoes_tipos" "formato_id" "INTEGER REFERENCES qualificacoes_formatos(id)"
ensure_sqlite_column "qualificacoes_historico" "formato_id" "INTEGER REFERENCES qualificacoes_formatos(id)"
ensure_sqlite_column "qualificacoes_historico" "formato_codigo" "TEXT"
ensure_sqlite_column "qualificacoes_historico" "categoria_id" "INTEGER REFERENCES qualificacoes_categorias(id)"
ensure_sqlite_column "qualificacoes_historico" "categoria_codigo" "TEXT"

printf 'setup:lms:local: applying LMS migrations locally\n'
for migration_file in "${LMS_MIGRATIONS[@]}"; do
  apply_local_migration "$migration_file"
done

for migration_file in "${LMS_MIGRATIONS[@]}"; do
  require_migration_recorded "$(basename "$migration_file")"
done

for table_name in token_blocklist audit_logs lms_cursos lms_matriculas lms_progresso_scorm qualificacoes_tipos_setores lms_cursos_setores lms_scorm_package_versions lms_scorm_package_audit_log lms_completion_diagnostics_snapshots; do
  require_sqlite_table "$table_name"
done

for column_name in empresa_id usuario_id acao tabela registro_id created_at; do
  require_sqlite_column "audit_logs" "$column_name"
done

ensure_sqlite_column "lms_cursos" "formato_id" "INTEGER REFERENCES qualificacoes_formatos(id)"
ensure_sqlite_column "lms_cursos" "dominio_codigo" "TEXT"
require_sqlite_column "lms_cursos" "conteudo_arquivo_nome"
require_sqlite_column "lms_cursos" "h5p_conteudo_id"
require_sqlite_column "lms_matriculas" "ultimo_slide"
require_sqlite_column "qualificacoes_historico" "validacao_hash"

printf 'setup:lms:local: applying synthetic LMS smoke seed\n'
sqlite3 "$SQLITE_FILE" < "$SEED_FILE"

printf 'setup:lms:local: ready\n'