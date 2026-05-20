#!/bin/bash
set -e

API_URL="http://localhost:8787"
WEB_URL="http://localhost:3000"

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

check_port() {
  local port=$1
  if lsof -iTCP:$port -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    echo -e "${GREEN}●${NC} Porta $port escutando"
  else
    echo -e "${RED}○${NC} Porta $port não está ativa"
    return 1
  fi
}

check_health() {
  local url=$1
  if curl -s --max-time 2 "$url" | python3 -m json.tool >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} ${url} OK"
  else
    echo -e "${RED}✗${NC} ${url} falhou"
    return 1
  fi
}

status=0

echo "==> Verificando portas"
check_port 3000 || status=1
check_port 8787 || status=1

echo "\n==> Verificando endpoints"
check_health "$API_URL/api/health" || status=1
check_health "$API_URL/api/version" || status=1

exit $status
