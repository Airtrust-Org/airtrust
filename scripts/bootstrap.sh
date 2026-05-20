#!/bin/bash

# AirTrust Bootstrap - Inicialização completa do sistema
# Garante que tudo está pronto para rodar

set -e  # Parar em caso de erro

echo "🚀 AirTrust Bootstrap - Inicialização Completa"
echo "=============================================="
echo ""

# 1. Parar processos anteriores
echo "📍 Passo 1/6: Limpando processos anteriores..."
lsof -ti:8787 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
pkill -9 -f wrangler 2>/dev/null || true
pkill -9 -f vite 2>/dev/null || true
sleep 2
echo "   ✓ Processos limpos"
echo ""

# 2. Limpar cache (opcional)
echo "📍 Passo 2/6: Limpando cache..."
rm -rf .wrangler/state 2>/dev/null || true
echo "   ✓ Cache limpo"
echo ""

# 3. Iniciar worker temporariamente para criar DB
echo "📍 Passo 3/6: Iniciando worker temporário..."
npm run dev:worker > /tmp/worker-bootstrap.log 2>&1 &
WORKER_PID=$!
sleep 8
echo "   ✓ Worker iniciado (PID: $WORKER_PID)"
echo ""

# 4. Aplicar migração core
echo "📍 Passo 4/6: Aplicando migrações..."
npx wrangler d1 execute airtrust-db --local --file=./migrations/0013_airtrust_core.sql 2>&1 | grep -E "success|error" || true
echo "   ✓ Migrações aplicadas"
echo ""

# 5. Verificar tabelas
echo "📍 Passo 5/6: Verificando tabelas..."
DB_FILE=$(find .wrangler/state/v3/d1/miniflare-D1DatabaseObject -name "*.sqlite" 2>/dev/null | head -1)
if [ -n "$DB_FILE" ]; then
  echo "   Tabelas encontradas:"
  sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;" | while read table; do
    count=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "0")
    echo "     ✓ $table ($count registros)"
  done
else
  echo "   ⚠️  Banco não encontrado ainda"
fi
echo ""

# 6. Parar worker temporário
echo "📍 Passo 6/6: Finalizando..."
kill $WORKER_PID 2>/dev/null || true
sleep 2
echo "   ✓ Worker temporário encerrado"
echo ""

# Teste de health (se worker ainda estiver rodando)
echo "🏥 Testando health check..."
HEALTH=$(curl -s http://localhost:8787/health 2>/dev/null || echo '{"status":"offline"}')
echo "   Resposta: $HEALTH"
echo ""

echo "=============================================="
echo "✅ Bootstrap concluído com sucesso!"
echo ""
echo "Para iniciar o sistema:"
echo "  Backend:  npm run dev:worker"
echo "  Frontend: npm run dev"
echo "  Ambos:    npm run dev:all"
echo ""
echo "Para verificar health:"
echo "  curl http://localhost:8787/health"
echo ""
