#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/filipedaumas/Documents/airtrust v1"
API="https://airtrust-api-production.airtrust.workers.dev/api"
DB="airtrust-db"

cd "$ROOT"

echo "[audit] criando funcionário temporário..."
CREATE_OUT=$(wrangler d1 execute "$DB" --remote --command "INSERT INTO funcionarios (nome, status, ativo, email, created_at, updated_at) VALUES ('AUDIT STATUS E2E TEMP', 'ATIVO', 1, 'audit-status-temp@airtrust.local', datetime('now'), datetime('now')) RETURNING id;")
TEMP_ID=$(echo "$CREATE_OUT" | grep -Eo '[0-9]+' | tail -1)

if [[ -z "${TEMP_ID:-}" ]]; then
  echo "[audit] ERRO: não foi possível obter TEMP_ID"
  exit 1
fi

echo "[audit] TEMP_ID=$TEMP_ID"

cleanup() {
  echo "[audit] limpando funcionário temporário..."
  wrangler d1 execute "$DB" --remote --command "DELETE FROM funcionarios WHERE id = $TEMP_ID;" >/dev/null || true
}
trap cleanup EXIT

check_filter() {
  local filter="$1"
  local should_find="$2"

  local found
  found=$(curl -fsSL "$API/funcionarios?status=$filter&limit=500" | jq --arg id "$TEMP_ID" '((.data // []) | any((.id|tostring)==$id))')

  echo "   filtro=$filter found=$found expected=$should_find"
  if [[ "$found" != "$should_find" ]]; then
    echo "[audit] ERRO: filtro $filter retornou resultado inesperado"
    exit 1
  fi
}

assert_consistency() {
  local expected_status="$1"
  local expected_ativo="$2"
  local row
  row=$(wrangler d1 execute "$DB" --remote --command "SELECT UPPER(COALESCE(NULLIF(TRIM(status), ''), 'ATIVO')) as status, COALESCE(ativo,1) as ativo FROM funcionarios WHERE id = $TEMP_ID;" )
  local st at
  st=$(echo "$row" | grep -Eo 'ATIVO|INATIVO|AFASTADO|FERIAS|DESLIGADO' | head -1)
  at=$(echo "$row" | grep -Eo '[0-9]+' | tail -1)
  echo "   db status=$st ativo=$at (esperado $expected_status/$expected_ativo)"
  if [[ "$st" != "$expected_status" || "$at" != "$expected_ativo" ]]; then
    echo "[audit] ERRO: consistência status/ativo inválida"
    exit 1
  fi
}

step() {
  local status="$1"
  local ativo="$2"
  local filter="$3"
  echo "[audit] set status=$status ativo=$ativo"
  wrangler d1 execute "$DB" --remote --command "UPDATE funcionarios SET status='$status', ativo=$ativo, updated_at=datetime('now') WHERE id=$TEMP_ID;" >/dev/null
  assert_consistency "$status" "$ativo"
  check_filter "$filter" true
}

step "DESLIGADO" 0 "desligados"
step "ATIVO" 1 "ativo"
step "AFASTADO" 0 "afastados"
step "FERIAS" 0 "ferias"
step "INATIVO" 0 "inativo"
step "ATIVO" 1 "ativo"

echo "[audit] validação cruzada: não deve aparecer em filtros incorretos"
check_filter "desligados" false
check_filter "afastados" false
check_filter "ferias" false
check_filter "inativo" false
check_filter "ativo" true

echo "[audit] OK: bateria E2E por banco+API concluída com sucesso"
