#!/usr/bin/env bash
set -euo pipefail

# Full automation: optional D1 production sync + start backend (auto port) + start frontend.
# Skips sync if D1_PROD_DB is not set.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "========================================"
echo " AirTrust: Ambiente Local Automático"
echo "========================================"

# 1) Optional D1 sync
if [ -n "${D1_PROD_DB:-}" ]; then
  echo "🗄️  Iniciando sync opcional D1 produção -> local"
  if [ ! -x scripts/sync-d1-from-production.sh ]; then
    chmod +x scripts/sync-d1-from-production.sh || true
  fi
  ./scripts/sync-d1-from-production.sh || echo "⚠️  Sync falhou (seguindo mesmo assim)"
else
  echo "ℹ️  Variável D1_PROD_DB não definida. Pulando sync de produção."
fi

# 2) Ensure .env.local exists
if [ ! -f .env.local ]; then
  echo "📝 Criando .env.local mínimo"
  cat > .env.local <<'EOF'
VITE_API_URL=http://localhost:8787
VITE_ENVIRONMENT=development
VITE_APP_NAME=AirTrust Local
VITE_DEBUG=true
EOF
fi

# 3) Start backend (auto port) in background
if [ ! -f scripts/dev-auto-port.js ]; then
  echo "❌ scripts/dev-auto-port.js ausente"
  exit 1
fi

echo "🚀 Subindo backend (porta dinâmica)"
node scripts/dev-auto-port.js &
BACKEND_PID=$!

# Aguarda backend levantar e extrai porta
sleep 3
BACKEND_PORT_LINE=$(grep -E "^VITE_API_URL=" .env.local || true)
BACKEND_PORT=$(printf "%s" "$BACKEND_PORT_LINE" | perl -ne 'print $1 if /localhost:(\d+)/')
if [ -z "${BACKEND_PORT}" ]; then BACKEND_PORT=8787; fi

# 4) Escolher porta de frontend disponível (prefer 3000, fallback 3001,3002)
choose_frontend_port() {
  for p in 3000 3001 3002; do
    if ! lsof -i :"$p" >/dev/null 2>&1; then
      echo "$p"
      return 0
    fi
  done
  echo 3000
}
FRONTEND_PORT=$(choose_frontend_port)

echo "🖥️  Subindo frontend Vite na porta $FRONTEND_PORT"
npx vite --port "$FRONTEND_PORT" --host &
FRONTEND_PID=$!

sleep 2

# 5) Health check backend
BACKEND_HEALTH=$(curl -s "http://localhost:$BACKEND_PORT/health" || echo '{}')

echo "========================================"
echo "✅ Ambiente pronto"
echo "Frontend:  http://localhost:$FRONTEND_PORT"
echo "Backend:   http://localhost:$BACKEND_PORT"
echo "Health:    $(echo "$BACKEND_HEALTH" | head -c 120)"
echo "DB Local:  D1 (SQLite)"
echo "Sync D1:   ${D1_PROD_DB:-(não executado)}"
echo "Encerrar:  kill $BACKEND_PID $FRONTEND_PID"
echo "========================================"

wait