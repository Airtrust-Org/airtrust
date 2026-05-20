#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/filipedaumas/Documents/airtrust v1"
API="https://airtrust-api-production.airtrust.workers.dev/api"
DB="airtrust-db"
TARGET_ID=42

cd "$ROOT"

orig=$(wrangler d1 execute "$DB" --remote --json --command "SELECT id, UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) as status, COALESCE(ativo,1) as ativo FROM funcionarios WHERE id = $TARGET_ID;")
orig_status=$(echo "$orig" | jq -r '.[0].results[0].status')
orig_ativo=$(echo "$orig" | jq -r '.[0].results[0].ativo')
orig_nome=$(echo "$orig" | jq -r '.[0].results[0].id')

echo "[audit] TARGET_ID=$TARGET_ID status_original=$orig_status ativo_original=$orig_ativo"

restore() {
  wrangler d1 execute "$DB" --remote --command "UPDATE funcionarios SET status='$orig_status', ativo=$orig_ativo, updated_at=datetime('now') WHERE id=$TARGET_ID;" >/dev/null || true
}
trap restore EXIT

step() {
  local status="$1"
  local ativo="$2"
  local filtro="$3"

  echo "[audit] set status=$status ativo=$ativo"
  wrangler d1 execute "$DB" --remote --command "UPDATE funcionarios SET status='$status', ativo=$ativo, updated_at=datetime('now') WHERE id=$TARGET_ID;" >/dev/null

  local db_now
  db_now=$(wrangler d1 execute "$DB" --remote --json --command "SELECT UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) as status, COALESCE(ativo,1) as ativo FROM funcionarios WHERE id = $TARGET_ID;")
  local got_status got_ativo
  got_status=$(echo "$db_now" | jq -r '.[0].results[0].status')
  got_ativo=$(echo "$db_now" | jq -r '.[0].results[0].ativo')

  local in_filter
  in_filter=$(curl -fsSL "$API/funcionarios?status=$filtro&limit=500" | jq --arg id "$TARGET_ID" '((.data // []) | any((.id|tostring)==$id))')

  echo "   status_db=$got_status ativo_db=$got_ativo filtro($filtro)=$in_filter"

  [[ "$got_status" == "$status" ]] || { echo "[audit] ERRO status"; exit 1; }
  [[ "$got_ativo" == "$ativo" ]] || { echo "[audit] ERRO ativo"; exit 1; }
  [[ "$in_filter" == "true" ]] || { echo "[audit] ERRO filtro"; exit 1; }
}

step "DESLIGADO" 0 "desligados"
step "ATIVO" 1 "ativo"
step "AFASTADO" 0 "afastados"
step "FERIAS" 0 "ferias"
step "INATIVO" 0 "inativo"
step "ATIVO" 1 "ativo"

echo "[audit] bateria concluída com sucesso; restaurando estado original via trap..."
