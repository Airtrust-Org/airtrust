#!/bin/bash
set -e

echo "🧹 Resetando ambiente de desenvolvimento (matando portas comuns)..."
for PORT in 5173 8787 3000 4173; do
  echo " - Porta $PORT"
  lsof -ti:$PORT 2>/dev/null | xargs kill -9 2>/dev/null || true
done

echo "✅ Ambiente dev limpo."
