#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKER_DIR="$ROOT_DIR/worker-airtrust"
BACKUPS_DIR="$ROOT_DIR/backups"
WRANGLER=(npx -y node@20 node_modules/wrangler/bin/wrangler.js)
TARGET="local"
ASSUME_YES=0
CONFIRM_SYNC_TEXT="I understand this exports production D1 and writes only to the selected non-production target"

usage() {
  cat <<'EOF'
Uso:
  AIRTRUST_ALLOW_PROD_SYNC=1 bash scripts/sync-d1-production-sanitized.sh [--target local|development] [--yes]

Proteções:
  - Exige AIRTRUST_ALLOW_PROD_SYNC=1
  - --yes exige AIRTRUST_CONFIRM_PROD_SYNC com o texto exato informado pelo script
  - Nunca aponta localhost para produção
  - Sempre anonimiza dados pessoais e limpa tokens/logs operacionais
EOF
}

info() {
  printf '\033[0;34mℹ\033[0m  %s\n' "$*"
}

ok() {
  printf '\033[0;32m✓\033[0m  %s\n' "$*"
}

warn() {
  printf '\033[1;33m⚠\033[0m  %s\n' "$*"
}

fail() {
  printf '\033[0;31m✗\033[0m  %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Argumento inválido: $1"
      ;;
  esac
done

[[ "$TARGET" == "local" || "$TARGET" == "development" ]] || fail "--target deve ser local ou development"
[[ "${AIRTRUST_ALLOW_PROD_SYNC:-0}" == "1" ]] || fail "Defina AIRTRUST_ALLOW_PROD_SYNC=1 para autorizar export de produção"
command -v sqlite3 >/dev/null 2>&1 || fail "sqlite3 não encontrado"
[[ -d "$WORKER_DIR" ]] || fail "worker-airtrust não encontrado"

warn "PRODUCTION D1 EXPORT PATH: este script exporta produção e escreve apenas em target não-produtivo."

if [[ "$ASSUME_YES" -ne 1 ]]; then
  warn "Você vai exportar produção e importar uma cópia anonimizada em $TARGET."
  printf 'Digite SYNC para continuar: '
  read -r confirmation
  [[ "$confirmation" == "SYNC" ]] || fail "Operação cancelada"
else
  [[ "${AIRTRUST_CONFIRM_PROD_SYNC:-}" == "$CONFIRM_SYNC_TEXT" ]] || fail "Com --yes, defina AIRTRUST_CONFIRM_PROD_SYNC exatamente como: $CONFIRM_SYNC_TEXT"
fi

mkdir -p "$BACKUPS_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
EXPORT_FILE="$BACKUPS_DIR/production-export-$STAMP.sql"
SANITIZE_FILE="$BACKUPS_DIR/production-sanitize-$STAMP.sql"

run_wranger_in_worker() {
  (
    cd "$WORKER_DIR"
    "$@"
  )
}

local_exec() {
  run_wranger_in_worker "${WRANGLER[@]}" d1 execute DB --config wrangler.dev.toml --local "$@"
}

dev_exec() {
  run_wranger_in_worker bash -lc "printf 'y\n' | ${WRANGLER[*]} d1 execute airtrust-db-dev --env development --remote $*"
}

dev_exec_file() {
  local file_path="$1"
  run_wranger_in_worker bash -lc "printf 'y\n' | ${WRANGLER[*]} d1 execute airtrust-db-dev --env development --remote --file \"$file_path\""
}

split_remote_import_export() {
  local input_file="$1"
  local output_dir="$2"

  python3 "$ROOT_DIR/scripts/split-d1-export.py" \
    --input "$input_file" \
    --output-dir "$output_dir"
}

import_development_export_batches() {
  local input_file="$1"
  local batch_dir="$2"
  local batch_files=()
  local batch_file
  local total_batches
  local current_batch=0

  split_remote_import_export "$input_file" "$batch_dir"
  batch_files=("$batch_dir"/part-*.sql)
  total_batches="${#batch_files[@]}"

  for batch_file in "${batch_files[@]}"; do
    current_batch=$((current_batch + 1))
    info "Importando lote $current_batch/$total_batches em development remoto"
    dev_exec_file "$batch_file"
  done
}

local_exec_command() {
  local command="$1"
  local_exec --command "$command"
}

get_local_sqlite_file() {
  find "$WORKER_DIR/.wrangler/state/v3/d1/miniflare-D1DatabaseObject" \
    -name "*.sqlite" ! -name "*-shm" ! -name "*-wal" 2>/dev/null | head -1
}

ensure_local_sqlite_file() {
  local sqlite_file

  local_exec --command "SELECT 1" >/dev/null 2>&1 || true
  sqlite_file="$(get_local_sqlite_file)"
  [[ -n "$sqlite_file" ]] || fail "Arquivo SQLite local não encontrado após inicializar D1 local"

  printf '%s\n' "$sqlite_file"
}

local_sqlite_apply_file() {
  local sqlite_file="$1"
  local file_path="$2"

  sqlite3 "$sqlite_file" < "$file_path"
}

dev_exec_command() {
  local command="$1"
  run_wranger_in_worker bash -lc "printf 'y\n' | ${WRANGLER[*]} d1 execute airtrust-db-dev --env development --remote --command \"$command\""
}

local_table_exists() {
  local table_name="$1"
  local output
  output="$(local_exec_command "SELECT name FROM sqlite_master WHERE type='table' AND name='${table_name}'" 2>/dev/null || true)"
  grep -q "\"name\": \"${table_name}\"" <<<"$output"
}

dev_table_exists() {
  local table_name="$1"
  local output
  output="$(dev_exec_command "SELECT name FROM sqlite_master WHERE type='table' AND name='${table_name}'" 2>/dev/null || true)"
  grep -q "\"name\": \"${table_name}\"" <<<"$output"
}

drop_development_objects() {
  local output object_name object_type temp_sql

  output="$(dev_exec_command "SELECT type || ':' || name AS object_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND type IN ('view', 'table') ORDER BY CASE type WHEN 'view' THEN 0 ELSE 1 END, name" 2>/dev/null || true)"

  temp_sql="$(mktemp /tmp/airtrust-drop-dev-XXXXXX.sql)"
  cat > "$temp_sql" <<'EOF'
PRAGMA foreign_keys=OFF;
EOF

  while IFS= read -r object_name; do
    [[ -n "$object_name" ]] || continue
    object_type="${object_name%%:*}"
    object_name="${object_name#*:}"
    if [[ "$object_type" == "view" ]]; then
      printf 'DROP VIEW IF EXISTS "%s";\n' "$object_name" >> "$temp_sql"
    else
      printf 'DROP TABLE IF EXISTS "%s";\n' "$object_name" >> "$temp_sql"
    fi
  done < <(sed -n 's/.*"object_name": "\([^"]*\)".*/\1/p' <<<"$output")

  printf 'PRAGMA foreign_keys=ON;\n' >> "$temp_sql"
  dev_exec_file "$temp_sql"
  rm -f "$temp_sql"
}

append_sql_if_table() {
  local table_name="$1"
  shift

  if { [[ "$TARGET" == "local" ]] && local_table_exists "$table_name"; } || { [[ "$TARGET" == "development" ]] && dev_table_exists "$table_name"; }; then
    printf '%s\n' "$*" >> "$SANITIZE_FILE"
  fi
}

append_sql_block_if_table() {
  local table_name="$1"

  if { [[ "$TARGET" == "local" ]] && local_table_exists "$table_name"; } || { [[ "$TARGET" == "development" ]] && dev_table_exists "$table_name"; }; then
    cat >> "$SANITIZE_FILE"
  fi
}

info "Exportando D1 de produção para $EXPORT_FILE"
run_wranger_in_worker bash -lc "printf 'y\n' | ${WRANGLER[*]} d1 export airtrust-db --remote --output \"$EXPORT_FILE\""
ok "Export concluído"

if [[ "$TARGET" == "local" ]]; then
  info "Limpando estado D1 local"
  rm -rf "$WORKER_DIR/.wrangler/state/v3/d1"
  LOCAL_SQLITE_FILE="$(ensure_local_sqlite_file)"
  info "Importando dump em D1 local"
  local_sqlite_apply_file "$LOCAL_SQLITE_FILE" "$EXPORT_FILE"
else
  IMPORT_BATCH_DIR="$(mktemp -d /tmp/airtrust-dev-import-XXXXXX)"
  info "Limpando banco development remoto"
  drop_development_objects
  info "Importando dump anonimizado em development remoto"
  import_development_export_batches "$EXPORT_FILE" "$IMPORT_BATCH_DIR"
  rm -rf "$IMPORT_BATCH_DIR"
fi

cat > "$SANITIZE_FILE" <<'EOF'
PRAGMA foreign_keys=OFF;
EOF

append_sql_if_table "refresh_tokens" "DELETE FROM refresh_tokens;"
append_sql_block_if_table "usuarios" <<'EOF'
UPDATE usuarios
SET email = printf('user_%s@dev.airtrust.local', id),
    nome = printf('Usuario DEV %s', id),
    password_hash = '$2b$10$g2ndd.4BDOPg4O0vb.7cGeX88MhzayrKRiwomRatJkuyfKkj9XWPG',
    failed_login_attempts = 0,
    locked_until = NULL,
    last_login = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NULL;
EOF
append_sql_block_if_table "funcionarios" <<'EOF'
UPDATE funcionarios
SET nome = printf('Funcionario DEV %s', id),
    email = CASE WHEN email IS NULL OR trim(email) = '' THEN NULL ELSE printf('funcionario_%s@dev.airtrust.local', id) END,
    cpf = CASE WHEN cpf IS NULL OR trim(cpf) = '' THEN NULL ELSE printf('%011d', id) END,
    telefone = NULL,
    telefone_emergencia = NULL,
    contato_emergencia_nome = NULL,
    endereco = NULL,
    cep = NULL,
    logradouro = NULL,
    numero = NULL,
    complemento = NULL,
    bairro = NULL,
    foto_url = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NULL;
EOF
append_sql_block_if_table "legacy_funcionarios" <<'EOF'
UPDATE legacy_funcionarios
SET nome = printf('Legacy DEV %s', id),
    email = CASE WHEN email IS NULL OR trim(email) = '' THEN NULL ELSE printf('legacy_%s@dev.airtrust.local', id) END,
    cpf = CASE WHEN cpf IS NULL OR trim(cpf) = '' THEN NULL ELSE printf('%011d', id) END,
    telefone = NULL;
EOF
append_sql_block_if_table "integracoes_edapp_usuarios" <<'EOF'
UPDATE integracoes_edapp_usuarios
SET edapp_email = CASE
      WHEN edapp_email IS NULL OR trim(edapp_email) = '' THEN NULL
      ELSE printf('edapp_%s@dev.airtrust.local', id)
    END,
    updated_at = datetime('now')
WHERE deleted_at IS NULL;
EOF
append_sql_block_if_table "integracoes_edapp_config" <<'EOF'
UPDATE integracoes_edapp_config
SET valor = NULL,
    updated_at = datetime('now')
WHERE deleted_at IS NULL
  AND (
    lower(chave) LIKE '%token%'
    OR lower(chave) LIKE '%secret%'
    OR lower(chave) LIKE '%webhook%'
    OR lower(chave) LIKE '%password%'
  );
EOF
append_sql_block_if_table "empresas_config" <<'EOF'
UPDATE empresas_config
SET webhook_url = NULL,
    email_notificacoes = CASE
      WHEN email_notificacoes IS NULL OR trim(email_notificacoes) = '' THEN NULL
      ELSE printf('empresa_%s@dev.airtrust.local', empresa_id)
    END,
    updated_at = datetime('now');
EOF
append_sql_if_table "notificacoes" "DELETE FROM notificacoes;"
append_sql_if_table "notificacoes_log" "DELETE FROM notificacoes_log;"
append_sql_if_table "notificacoes_inapp" "DELETE FROM notificacoes_inapp;"
append_sql_if_table "notificacoes_sistema" "DELETE FROM notificacoes_sistema;"
append_sql_block_if_table "integracoes_edapp_eventos" <<'EOF'
DELETE FROM integracoes_edapp_eventos
WHERE deleted_at IS NULL
  AND tipo_evento NOT IN ('CourseCompletedEvent', 'course.completed', 'analytics.courseprogress.completed');

UPDATE integracoes_edapp_eventos
SET erro_ultima = CASE
      WHEN erro_ultima IS NULL OR trim(erro_ultima) = '' THEN NULL
      ELSE 'SANITIZED'
    END,
    payload_json = CASE
      WHEN json_valid(payload_json) THEN json_set(
        payload_json,
        '$.data.email',
        CASE
          WHEN json_extract(payload_json, '$.data.email') IS NULL THEN NULL
          ELSE printf('edapp_event_%s@dev.airtrust.local', id)
        END,
        '$.data.username',
        CASE
          WHEN json_extract(payload_json, '$.data.username') IS NULL THEN NULL
          ELSE printf('edapp_user_%s', id)
        END,
        '$.data.userExternalId',
        CASE
          WHEN json_extract(payload_json, '$.data.userExternalId') IS NULL THEN NULL
          ELSE printf('edapp_external_%s', id)
        END,
        '$.email',
        CASE
          WHEN json_extract(payload_json, '$.email') IS NULL THEN NULL
          ELSE printf('edapp_event_%s@dev.airtrust.local', id)
        END,
        '$.username',
        CASE
          WHEN json_extract(payload_json, '$.username') IS NULL THEN NULL
          ELSE printf('edapp_user_%s', id)
        END
      )
      ELSE payload_json
    END,
    updated_at = datetime('now')
WHERE deleted_at IS NULL;
EOF
append_sql_if_table "logs_acesso_dados" "DELETE FROM logs_acesso_dados;"
printf '%s\n' 'PRAGMA foreign_keys=ON;' >> "$SANITIZE_FILE"

if [[ "$TARGET" == "local" ]]; then
  info "Aplicando anonimização local"
  local_sqlite_apply_file "$LOCAL_SQLITE_FILE" "$SANITIZE_FILE"
  if [[ -f "$ROOT_DIR/scripts/setup-local-overrides.sql" ]]; then
    info "Aplicando overrides locais"
    local_sqlite_apply_file "$LOCAL_SQLITE_FILE" "$ROOT_DIR/scripts/setup-local-overrides.sql"
  fi
  VALIDATION_USERS="$(local_exec --command "SELECT COUNT(*) AS c FROM usuarios WHERE deleted_at IS NULL" 2>/dev/null || true)"
  VALIDATION_FUNCS="$(local_exec --command "SELECT COUNT(*) AS c FROM funcionarios WHERE deleted_at IS NULL" 2>/dev/null || true)"
else
  info "Aplicando anonimização em development remoto"
  run_wranger_in_worker bash -lc "printf 'y\n' | ${WRANGLER[*]} d1 execute airtrust-db-dev --env development --remote --file \"$SANITIZE_FILE\""
  if [[ -f "$ROOT_DIR/scripts/setup-local-overrides.sql" ]]; then
    info "Aplicando admin/overrides idempotentes em development"
    run_wranger_in_worker bash -lc "printf 'y\n' | ${WRANGLER[*]} d1 execute airtrust-db-dev --env development --remote --file \"$ROOT_DIR/scripts/setup-local-overrides.sql\""
  fi
  VALIDATION_USERS="$(dev_exec_command "SELECT COUNT(*) AS c FROM usuarios WHERE deleted_at IS NULL" 2>/dev/null || true)"
  VALIDATION_FUNCS="$(dev_exec_command "SELECT COUNT(*) AS c FROM funcionarios WHERE deleted_at IS NULL" 2>/dev/null || true)"
fi

ok "Sync sanitizado concluído para $TARGET"
echo ""
echo "Arquivo exportado: $EXPORT_FILE"
echo "Arquivo anonimização: $SANITIZE_FILE"
echo ""
echo "Validação usuarios:"
echo "$VALIDATION_USERS"
echo ""
echo "Validação funcionarios:"
echo "$VALIDATION_FUNCS"
