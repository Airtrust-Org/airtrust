#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "ERROR: git nao encontrado no PATH." >&2
  exit 2
fi

count_secret_env=0
count_prod_dump=0
count_local_seed=0
count_test_fixture=0
count_migration=0
count_unknown=0
count_blocking=0
count_total=0

report_file="$(mktemp)"
cleanup() {
  rm -f "$report_file"
}
trap cleanup EXIT

is_env_candidate() {
  local path="$1"
  [[ "$path" =~ (^|/)\.env($|[.].*) ]]
}

is_credential_candidate() {
  local path="$1"
  [[ "$path" =~ \.(pem|p12|pfx|key)$ ]] || [[ "$path" =~ (^|/)(secret|token|credential|credentials)(/|_|-|\.|$) ]]
}

is_db_candidate() {
  local path="$1"
  [[ "$path" =~ \.(sqlite|sqlite3|db)$ ]]
}

is_sql_candidate() {
  local path="$1"
  [[ "$path" == *.sql ]]
}

is_allowlisted_fixture() {
  local path="$1"
  case "$path" in
    .env.example|worker-airtrust/.env.example)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

classify_path() {
  local path="$1"

  if is_env_candidate "$path"; then
    if is_allowlisted_fixture "$path"; then
      echo "TEST_FIXTURE"
    else
      echo "SECRET_ENV"
    fi
    return
  fi

  if is_credential_candidate "$path"; then
    echo "UNKNOWN_REVIEW_REQUIRED"
    return
  fi

  if is_db_candidate "$path"; then
    echo "UNKNOWN_REVIEW_REQUIRED"
    return
  fi

  if is_sql_candidate "$path"; then
    if [[ "$path" =~ ^worker-airtrust/migrations/ ]]; then
      echo "MIGRATION"
      return
    fi

    if [[ "$path" =~ (^|/)(__tests__/|fixtures?/|test[-_]?data(/|$)) ]]; then
      echo "TEST_FIXTURE"
      return
    fi

    if [[ "$path" =~ (^|/)scripts/legacy/ ]] || \
       [[ "$path" =~ d1-prod ]] || \
       [[ "$path" =~ (^|/).*prod.*\.sql$ ]] || \
       [[ "$path" =~ (^|/).*backup.*\.sql$ ]] || \
       [[ "$path" =~ (^|/).*dump.*\.sql$ ]]; then
      echo "PROD_DUMP_OR_BACKUP"
      return
    fi

    if [[ "$path" =~ (^|/).*seed.*\.sql$ ]]; then
      echo "LOCAL_SEED"
      return
    fi

    echo "UNKNOWN_REVIEW_REQUIRED"
    return
  fi

  echo "UNKNOWN_REVIEW_REQUIRED"
}

is_blocking_category() {
  local category="$1"
  case "$category" in
    SECRET_ENV|PROD_DUMP_OR_BACKUP|LOCAL_SEED|UNKNOWN_REVIEW_REQUIRED)
      return 0
      ;;
    MIGRATION|TEST_FIXTURE)
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

increment_category() {
  local category="$1"
  case "$category" in
    SECRET_ENV) count_secret_env=$((count_secret_env + 1)) ;;
    PROD_DUMP_OR_BACKUP) count_prod_dump=$((count_prod_dump + 1)) ;;
    LOCAL_SEED) count_local_seed=$((count_local_seed + 1)) ;;
    TEST_FIXTURE) count_test_fixture=$((count_test_fixture + 1)) ;;
    MIGRATION) count_migration=$((count_migration + 1)) ;;
    UNKNOWN_REVIEW_REQUIRED) count_unknown=$((count_unknown + 1)) ;;
  esac
}

while IFS= read -r file_path; do
  if is_env_candidate "$file_path" || is_credential_candidate "$file_path" || is_db_candidate "$file_path" || is_sql_candidate "$file_path"; then
    category="$(classify_path "$file_path")"
    increment_category "$category"
    count_total=$((count_total + 1))
    printf '%s|%s\n' "$category" "$file_path" >>"$report_file"
    if is_blocking_category "$category"; then
      count_blocking=$((count_blocking + 1))
    fi
  fi
done < <(git ls-files)

if [[ $count_total -eq 0 ]]; then
  echo "OK: Nenhum candidato sensivel rastreado foi detectado."
  exit 0
fi

echo "=== AIRTRUST Sensitive Files Guardrail (read-only) ==="
echo "Repositorio: $REPO_ROOT"
echo
echo "Categorias detectadas (arquivos rastreados):"
echo "  - SECRET_ENV: $count_secret_env"
echo "  - PROD_DUMP_OR_BACKUP: $count_prod_dump"
echo "  - LOCAL_SEED: $count_local_seed"
echo "  - TEST_FIXTURE: $count_test_fixture"
echo "  - MIGRATION: $count_migration"
echo "  - UNKNOWN_REVIEW_REQUIRED: $count_unknown"
echo
echo "Candidatos rastreados (categoria | caminho):"
sort "$report_file"
echo
echo "Regras:"
echo "  - MIGRATION e TEST_FIXTURE sao permitidos por allowlist/politica, mas permanecem auditaveis."
echo "  - SECRET_ENV, PROD_DUMP_OR_BACKUP, LOCAL_SEED e UNKNOWN_REVIEW_REQUIRED exigem acao manual."
echo "  - Este script nao le conteudo de arquivos nem executa mutacoes."

if [[ $count_blocking -gt 0 ]]; then
  echo
  echo "FAIL: $count_blocking candidato(s) bloqueante(s) detectado(s)."
  echo "Proxima fase recomendada: remocao controlada do index (git rm --cached), rotacao de segredos e estrategia de limpeza historica com autorizacao."
  exit 1
fi

echo
echo "OK: Nenhum candidato bloqueante detectado."
exit 0
