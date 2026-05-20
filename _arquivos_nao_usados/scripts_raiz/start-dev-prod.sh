#!/bin/bash
# Start dev environment with production database
# Frontend: http://localhost:3001
# API: http://localhost:8787

set -e

echo "🚀 Iniciando ambiente dev com dados de produção..."
echo ""
echo "Frontend: http://localhost:3001"
echo "API:      http://localhost:8787"
echo ""

# Start worker in one terminal
echo "Iniciando Worker (API) na porta 8787..."
cd worker-airtrust
wrangler dev --port 8787 --env dev-prod &
WORKER_PID=$!

# Give worker time to start
sleep 3

# Start frontend in current terminal
cd ..
echo "Iniciando Frontend (Vite) na porta 3001..."
npm run dev -- --port 3001

# Cleanup
trap "kill $WORKER_PID 2>/dev/null" EXIT
