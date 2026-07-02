#!/usr/bin/env bash

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
  "$WORKER_DIR/migrations/0349_lms_matriculas_ultimo_slide.sql"
  "$WORKER_DIR/migrations/0350_lms_composite_deleted_at_indexes.sql"
  "$WORKER_DIR/migrations/0360_matriz_treinamento_funcao.sql"
  "$WORKER_DIR/migrations/0389_platform_roles_support_access_foundation.sql"
  "$WORKER_DIR/migrations/0390_training_class_management.sql"
  "$WORKER_DIR/migrations/0407_qualificacoes_tipos_setores.sql"
  "$WORKER_DIR/migrations/0408_lms_cursos_setores.sql"
  "$WORKER_DIR/migrations/0409_lms_cursos_setores_backfill.sql"
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

if [[ "${1:-}" == "--reset" ]] || [[ ! -d "$LOCAL_STATE_DIR" ]]; then
  rm -rf "$LOCAL_STATE_DIR"
fi

cd "$ROOT_DIR"

printf 'setup:lms:local: applying versioned local schema\n'
if ! npx wrangler d1 execute "$DB_NAME" \
  --config "$DEV_CONFIG" \
  --local \
  --file "$SCHEMA_FILE" \
  >/dev/null 2>&1; then
  printf 'setup:lms:local: schema returned warnings; continuing\n' >&2
fi

SQLITE_FILE="$(find "$LOCAL_STATE_DIR/v3/d1/miniflare-D1DatabaseObject" \
  -name "*.sqlite" ! -name "*-shm" ! -name "*-wal" 2>/dev/null | head -n 1)"

[[ -n "$SQLITE_FILE" ]] || error "local SQLite file not found after schema apply"

ensure_sqlite_column() {
  local table_name="$1"
  local column_name="$2"
  local column_definition="$3"

  if ! sqlite3 "$SQLITE_FILE" "PRAGMA table_info($table_name);" | awk -F'|' '{ print $2 }' | grep -qx "$column_name"; then
    sqlite3 "$SQLITE_FILE" "ALTER TABLE $table_name ADD COLUMN $column_name $column_definition;"
  fi
}

printf 'setup:lms:local: ensuring local LMS metadata columns\n'
ensure_sqlite_column "qualificacoes_tipos" "conteudo_programatico" "TEXT"
ensure_sqlite_column "qualificacoes_tipos" "carga_horaria_inicial" "REAL"
ensure_sqlite_column "qualificacoes_tipos" "carga_horaria_recorrente" "REAL"
ensure_sqlite_column "qualificacoes_historico" "renovacao_de" "INTEGER DEFAULT NULL"

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
  [[ -f "$migration_file" ]] || error "migration not found: $migration_file"
  if ! npx wrangler d1 execute "$DB_NAME" \
    --config "$DEV_CONFIG" \
    --local \
    --file "$migration_file" \
    >/dev/null 2>&1; then
    printf 'setup:lms:local: migration returned warnings: %s\n' "$(basename "$migration_file")" >&2
  fi
done

ensure_sqlite_column "lms_cursos" "formato_id" "INTEGER REFERENCES qualificacoes_formatos(id)"

printf 'setup:lms:local: applying synthetic LMS smoke seed\n'
sqlite3 "$SQLITE_FILE" < "$SEED_FILE"

printf 'setup:lms:local: ready\n'
