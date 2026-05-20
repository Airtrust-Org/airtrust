#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")"/.. && pwd)"
cd "$ROOT_DIR"

LOG_DIR="$ROOT_DIR/.dev-logs"
mkdir -p "$LOG_DIR"

GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

start_servers() {
  echo -e "${YELLOW}↻ Reiniciando servidores (web + api)...${NC}"
  npm run dev:down >/dev/null 2>&1 || true
  # inicia em background totalmente desacoplado do terminal
  nohup npm run dev:all >"$LOG_DIR/dev-all.out" 2>"$LOG_DIR/dev-all.err" < /dev/null & disown || true
}

check_status() {
  ./scripts/dev-status.sh >/dev/null 2>&1
}

echo -e "${GREEN}▶ Watchdog dev ativo:${NC} manter web:3000 e api:8787 em execução"

# Primeira subida
if ! check_status ; then
  start_servers
  # Aguarda alguns segundos para subir
  sleep 3
fi

# Loop de monitoramento
INTERVAL=${INTERVAL:-5}
while true; do
  if ! check_status ; then
    echo -e "${RED}✗ Detecção de queda ou porta livre. Tentando recuperar...${NC}"
    start_servers
    # tempo extra para evitar churn
    sleep 3
  fi
  sleep "$INTERVAL"
done
