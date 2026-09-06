#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DEV_DB_NAME="airtrust-db-dev"
DEV_ENV="development"
SEED_FILE="./seeds/dev-seed.sql"
BOOTSTRAP_SCHEMA_FILE="./scripts/schema-local.sql"
WRANGLER=(npx -y node@20 node_modules/wrangler/bin/wrangler.js)
REMOTE_WRITE_CONFIRMATION="${AIRTRUST_ALLOW_REMOTE_DEV_DB_WRITE:-}"
RESET_CONFIRMATION="${AIRTRUST_DEV_DB_RESET_CONFIRMATION:-}"
ALLOW_RESET=false

for arg in "$@"; do
  case "$arg" in
    --reset-incompatible) ALLOW_RESET=true ;;
    *) echo "Argumento desconhecido: $arg" >&2; exit 2 ;;
  esac
done

[[ "$DEV_ENV" == "development" ]] || { echo "Ambiente remoto recusado: $DEV_ENV" >&2; exit 2; }
[[ "$DEV_DB_NAME" == "airtrust-db-dev" ]] || { echo "Banco remoto recusado: $DEV_DB_NAME" >&2; exit 2; }
[[ "$REMOTE_WRITE_CONFIRMATION" == "AIRTRUST_DEVELOPMENT_ONLY" ]] || {
  echo "Mutacao D1 development requer AIRTRUST_ALLOW_REMOTE_DEV_DB_WRITE=AIRTRUST_DEVELOPMENT_ONLY" >&2
  exit 2
}

INCREMENTAL_MIGRATIONS=(
  "./migrations/0304_usuarios_perfis_e_permissoes.sql"
  "./migrations/0335_lms_cursos.sql"
  "./migrations/0336_lms_matriculas.sql"
  "./migrations/0337_lms_progresso_scorm.sql"
  "./migrations/0338_lms_indexes.sql"
  "./migrations/0339_lms_h5p_xapi.sql"
)

info() {
  printf '\033[0;34mℹ\033[0m  %s\n' "$*"
}

ok() {
  printf '\033[0;32m✓\033[0m  %s\n' "$*"
}

fail() {
  printf '\033[0;31m✗\033[0m  %s\n' "$*" >&2
  exit 1
}

warn() {
  printf '\033[1;33m⚠\033[0m  %s\n' "$*"
}

table_exists() {
  local table_name="$1"
  local output
  output=$(printf 'y\n' | "${WRANGLER[@]}" d1 execute "$DEV_DB_NAME" --env "$DEV_ENV" --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='${table_name}'" 2>/dev/null || true)
  grep -q "\"name\": \"${table_name}\"" <<<"$output"
}

column_exists() {
  local table_name="$1"
  local column_name="$2"
  local output
  output=$(printf 'y\n' | "${WRANGLER[@]}" d1 execute "$DEV_DB_NAME" --env "$DEV_ENV" --remote --command "PRAGMA table_info('${table_name}')" 2>/dev/null || true)
  grep -q "\"name\": \"${column_name}\"" <<<"$output"
}

reset_incompatible_schema() {
  local output
  [[ "$ALLOW_RESET" == "true" ]] || fail "Schema incompatível: reset automático bloqueado. Revise e use --reset-incompatible somente se realmente necessário."
  [[ "$RESET_CONFIRMATION" == "AIRTRUST_RESET_DEVELOPMENT_D1" ]] || fail "Reset destrutivo requer AIRTRUST_DEV_DB_RESET_CONFIRMATION=AIRTRUST_RESET_DEVELOPMENT_D1"
  local line

  info "Schema incompatível detectado; recriando estrutura do banco development..."
  output=$(printf 'y\n' | "${WRANGLER[@]}" d1 execute "$DEV_DB_NAME" --env "$DEV_ENV" --remote --command "SELECT type || ':' || name AS object_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' AND type IN ('view', 'table') ORDER BY CASE type WHEN 'view' THEN 0 ELSE 1 END, name" 2>/dev/null || true)

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    local object_type="${line%%:*}"
    local object_name="${line#*:}"
    if [[ "$object_type" == "$object_name" ]]; then
      continue
    fi
    if [[ "$object_type" == "view" ]]; then
      printf 'y\n' | "${WRANGLER[@]}" d1 execute "$DEV_DB_NAME" --env "$DEV_ENV" --remote --command "PRAGMA foreign_keys=off; DROP VIEW IF EXISTS \"${object_name}\""
    else
      printf 'y\n' | "${WRANGLER[@]}" d1 execute "$DEV_DB_NAME" --env "$DEV_ENV" --remote --command "PRAGMA foreign_keys=off; DROP TABLE IF EXISTS \"${object_name}\""
    fi
  done < <(sed -n 's/.*"object_name": "\([^"]*\)".*/\1/p' <<<"$output")

  ok "Estrutura anterior removida"
}

apply_sql() {
  local file="$1"
  info "Aplicando $(basename "$file")..."
  if printf 'y\n' | "${WRANGLER[@]}" d1 execute "$DEV_DB_NAME" --env "$DEV_ENV" --remote --file "$file"; then
    ok "$(basename "$file") aplicado"
  else
    warn "$(basename "$file") retornou aviso/erro de re-run; seguindo"
  fi
}

command -v npx >/dev/null 2>&1 || fail "npx não encontrado"
[[ -f "$SEED_FILE" ]] || fail "Seed não encontrado em $SEED_FILE"
[[ -f "$BOOTSTRAP_SCHEMA_FILE" ]] || fail "Schema bootstrap não encontrado em $BOOTSTRAP_SCHEMA_FILE"
[[ -f "./wrangler.toml" ]] || fail "wrangler.toml não encontrado"
[[ -d "./migrations" ]] || fail "Diretório de migrations não encontrado"

info "Verificando banco D1 de development ($DEV_DB_NAME)..."
if "${WRANGLER[@]}" d1 list 2>/dev/null | grep -q "$DEV_DB_NAME"; then
  ok "Banco development já existe"
else
  info "Banco development não existe. Criando..."
  "${WRANGLER[@]}" d1 create "$DEV_DB_NAME"
  fail "Atualize o database_id do ambiente development no wrangler.toml e rode novamente"
fi

if table_exists "usuarios" && { ! column_exists "usuarios" "password_hash" || ! table_exists "empresas"; }; then
  reset_incompatible_schema
fi

if table_exists "usuarios" && table_exists "empresas" && column_exists "usuarios" "password_hash"; then
  ok "Schema base já presente; bootstrap dispensado"
else
  info "Aplicando schema base compatível com produção em banco vazio..."
  TMP_SCHEMA_FILE="$(mktemp /tmp/airtrust-dev-schema.XXXXXX.sql)"
  trap 'rm -f "$TMP_SCHEMA_FILE"' EXIT
  awk '
    BEGIN { skip = 0 }
    /CREATE TABLE d1_migrations\(/ { skip = 1; next }
    skip && /^\);$/ { skip = 0; next }
    !skip { print }
  ' "$BOOTSTRAP_SCHEMA_FILE" > "$TMP_SCHEMA_FILE"
  printf 'y\n' | "${WRANGLER[@]}" d1 execute "$DEV_DB_NAME" --env "$DEV_ENV" --remote --file "$TMP_SCHEMA_FILE"
  ok "Schema base garantido"
  rm -f "$TMP_SCHEMA_FILE"
  trap - EXIT
fi

for migration_file in "${INCREMENTAL_MIGRATIONS[@]}"; do
  [[ -f "$migration_file" ]] || fail "Migration não encontrada em $migration_file"
  apply_sql "$migration_file"
done

info "Aplicando seed fictício do ambiente development..."
printf 'y\n' | "${WRANGLER[@]}" d1 execute "$DEV_DB_NAME" --env "$DEV_ENV" --remote --file "$SEED_FILE"
ok "Seed aplicado"

echo
ok "Ambiente development pronto"
echo "  Banco: $DEV_DB_NAME"
echo "  Seed : $SEED_FILE"
echo "  Login: use credenciais de development fornecidas fora do repositório"
echo