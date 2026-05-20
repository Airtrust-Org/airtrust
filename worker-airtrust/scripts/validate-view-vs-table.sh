#!/bin/bash
set -euo pipefail
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

DB_BINDING="DB"
REMOTE_FLAG="--remote"

echo "🔍 Validando view vs tabela (qualificacoes)"

VIEW_EXISTS=$(npx wrangler d1 execute $DB_BINDING $REMOTE_FLAG --command "SELECT COUNT(*) c FROM sqlite_master WHERE type='view' AND name='qualificacoes_historico_v'" --json 2>/dev/null | jq -r '.[0].results[0].c')
TABLE_EXISTS=$(npx wrangler d1 execute $DB_BINDING $REMOTE_FLAG --command "SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='qualificacoes_historico'" --json 2>/dev/null | jq -r '.[0].results[0].c')

fail=0

if [ "$VIEW_EXISTS" != "1" ]; then echo -e "${RED}❌ View ausente${NC}"; fail=1; fi
if [ "$TABLE_EXISTS" != "1" ]; then echo -e "${RED}❌ Tabela ausente${NC}"; fail=1; fi

if [ $fail -eq 1 ]; then exit 1; fi

VIEW_COUNT=$(npx wrangler d1 execute $DB_BINDING $REMOTE_FLAG --command "SELECT COUNT(*) total FROM qualificacoes_historico_v" --json | jq -r '.[0].results[0].total')
TABLE_COUNT=$(npx wrangler d1 execute $DB_BINDING $REMOTE_FLAG --command "SELECT COUNT(*) total FROM qualificacoes_historico WHERE deleted_at IS NULL" --json | jq -r '.[0].results[0].total')

if [ "$VIEW_COUNT" != "$TABLE_COUNT" ]; then
  echo -e "${RED}❌ Divergência de contagem view($VIEW_COUNT) vs tabela($TABLE_COUNT)${NC}"; fail=1
else
  echo -e "${GREEN}✅ Contagem alinhada ($VIEW_COUNT)${NC}"
fi

CODIGO_STATS=$(npx wrangler d1 execute $DB_BINDING $REMOTE_FLAG --command "SELECT COUNT(*) total, SUM(CASE WHEN qualificacao_codigo IS NULL OR qualificacao_codigo = '' OR qualificacao_codigo = 'SEM CODIGO' THEN 1 ELSE 0 END) nulos FROM qualificacoes_historico_v" --json)
TOTAL=$(echo "$CODIGO_STATS" | jq -r '.[0].results[0].total')
NULOS=$(echo "$CODIGO_STATS" | jq -r '.[0].results[0].nulos')
RATIO=$(python3 - <<PY
print(0 if $TOTAL == 0 else $NULOS / $TOTAL)
PY
)

printf "Total: %s | Nulos: %s | Ratio: %.5f\n" "$TOTAL" "$NULOS" "$RATIO"

awk "BEGIN {exit ($RATIO <= 0.01)?0:1}" || { echo -e "${RED}❌ Ratio de códigos nulos acima de 1%% (${RATIO})${NC}"; fail=1; }

if [ $fail -eq 0 ]; then
  echo -e "${GREEN}✅ Validação PASS${NC}"; exit 0
else
  echo -e "${RED}❌ Validação FAIL${NC}"; exit 1
fi
