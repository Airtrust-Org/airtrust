#!/bin/bash
set -e
echo "🛑 Matando processos..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
sleep 2
echo "🧹 Limpando cache..."
rm -rf node_modules/.vite .vite dist
echo "🔨 Build..."
npm run build
echo "🚀 Iniciando..."
nohup npm run dev > /tmp/vite-server.log 2>&1 &
sleep 5
echo "✅ Server rodando: http://localhost:3000/simuladores"
echo "📊 Logs: tail -f /tmp/vite-server.log"
