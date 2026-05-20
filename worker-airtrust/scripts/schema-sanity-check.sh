#!/bin/bash
set -euo pipefail
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

DB_BINDING="DB"
REMOTE_FLAG="--remote"

echo "🔍 Schema Sanity Check - D1"

fail=0

function check_table() {
  local name="$1"
  local expected_min_cols="$2"
  local exists=$(npx wrangler d1 execute $DB_BINDING $REMOTE_FLAG --command "SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='$name'" --json 2>/dev/null | jq -r '.[0].results[0].c')
  if [ "$exists" != "1" ]; then
    echo -e "${RED}❌ Tabela $name ausente${NC}"; fail=1; return
  fi
  local cols=$(npx wrangler d1 execute $DB_BINDING $REMOTE_FLAG --command "PRAGMA table_info($name)" --json 2>/dev/null | jq -r '.[0].results | length')
  if [ "$cols" -lt "$expected_min_cols" ]; then
    echo -e "${RED}❌ Tabela $name colunas insuficientes ($cols < $expected_min_cols)${NC}"; fail=1
  else
    echo -e "${GREEN}✅ $name OK ($cols colunas)${NC}"
  fi
}

function check_view() {
  local name="$1"
  local exists=$(npx wrangler d1 execute $DB_BINDING $REMOTE_FLAG --command "SELECT COUNT(*) c FROM sqlite_master WHERE type='view' AND name='$name'" --json 2>/dev/null | jq -r '.[0].results[0].c')
  if [ "$exists" != "1" ]; then
    echo -e "${RED}❌ View $name ausente${NC}"; fail=1; return
  fi
  # sample columns
  local sample=$(npx wrangler d1 execute $DB_BINDING $REMOTE_FLAG --command "SELECT * FROM $name LIMIT 1" --json 2>/dev/null)
  local cols=$(echo "$sample" | jq '.[0].results[0] | keys | length' 2>/dev/null || echo 0)
  if [ "$cols" -lt 10 ]; then
    echo -e "${YELLOW}⚠️ View $name com poucas colunas ($cols)${NC}";
  fi
  echo -e "${GREEN}✅ View $name OK ($cols colunas detectadas)${NC}"
}

check_table "funcionarios" 10
check_table "qualificacoes_tipos" 8
check_table "qualificacoes_historico" 15

# Verificação de colunas críticas em qualificacoes_historico (view removida)
critical_cols=$(npx wrangler d1 execute $DB_BINDING $REMOTE_FLAG --command "PRAGMA table_info(qualificacoes_historico)" --json 2>/dev/null | jq -r '.[0].results[].name' | tr '\n' ' ')
need=("data_conclusao" "data_vencimento" "codigo" "categoria" "numero_certificado" "status")
for c in "${need[@]}"; do
  if ! echo "$critical_cols" | grep -q "\b$c\b"; then
    echo -e "${RED}❌ Coluna ausente em qualificacoes_historico: $c${NC}"; fail=1
  fi
done

if [ $fail -eq 0 ]; then
  echo -e "${GREEN}ℹ️  View qualificacoes_historico_v não é mais necessária (removida)${NC}"
fi

if [ $fail -eq 0 ]; then
  echo -e "${GREEN}✅ Schema sanity PASS${NC}"; exit 0
else
  echo -e "${RED}❌ Schema sanity FAIL${NC}"; exit 1
fi
