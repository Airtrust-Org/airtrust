#!/bin/bash
set -e

echo "🚀 AirTrust - Teste Final de Validação (Host)"
echo "=============================================="
echo ""

# Verificar se a porta está livre
echo "🔍 Verificando porta 8787..."
if lsof -i:8787 > /dev/null 2>&1; then
    echo "❌ Porta 8787 ainda em uso!"
    echo "Processos:"
    lsof -i:8787
    echo ""
    echo "Execute: lsof -ti:8787 | xargs kill -9"
    exit 1
else
    echo "✅ Porta 8787 livre!"
fi
echo ""

# Verificar PM2
echo "🔍 Verificando PM2..."
if pm2 list 2>/dev/null | grep -q "online"; then
    echo "⚠️  PM2 tem processos rodando:"
    pm2 list
    echo ""
    echo "Execute: pm2 stop all && pm2 delete all"
else
    echo "✅ PM2 limpo (sem processos)"
fi
echo ""

# Verificar node_modules
echo "🔍 Verificando dependências..."
if [ -d "node_modules" ]; then
    echo "✅ node_modules existe"
else
    echo "⚠️  node_modules não existe"
    echo "Execute: npm install"
fi
echo ""

# Verificar arquivos críticos
echo "🔍 Verificando arquivos críticos..."
for file in "src/worker/index.ts" "src/worker/routes/index.ts" "wrangler.dev.toml" ".dev.vars"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file NÃO ENCONTRADO!"
    fi
done
echo ""

# Verificar wrangler config
echo "🔍 Verificando configuração wrangler..."
if grep -q 'main = "src/worker/index.ts"' wrangler.dev.toml; then
    echo "✅ wrangler.dev.toml aponta para src/worker/index.ts"
else
    echo "❌ wrangler.dev.toml NÃO aponta para src/worker/index.ts!"
    grep "main =" wrangler.dev.toml
fi
echo ""

echo "=============================================="
echo "✨ Pré-validação completa!"
echo ""
echo "📋 Próximos passos:"
echo "  1. Reabrir no Dev Container (Cmd+Shift+P → Reopen in Container)"
echo "  2. Aguardar setup automático (2-3 min)"
echo "  3. Executar: npm run dev:worker"
echo "  4. Testar: curl http://localhost:8787/api/health"
echo ""
