#!/bin/bash

# ========================================
# START LOCAL - AMBIENTE DE DESENVOLVIMENTO
# ========================================
# Inicia worker local na porta 8787 com banco FIXO
# O banco NÃO é apagado - mantém os dados entre sessões

set -e

BANCO_DIR="worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
BANCO_FIXO="$BANCO_DIR/airtrust-local.sqlite"
BACKUP_PROD="backup-prod-20251120-112111.sql"

echo "🧹 Limpando processos antigos..."
pkill -9 -f "wrangler|workerd|vite" 2>/dev/null || true
sleep 2

# Criar diretório se não existir
mkdir -p "$BANCO_DIR"

# Verificar se banco fixo existe
if [ ! -f "$BANCO_FIXO" ]; then
    echo "⚠️  Banco local não encontrado. Criando do backup de produção..."
    if [ -f "$BACKUP_PROD" ]; then
        sqlite3 "$BANCO_FIXO" < "$BACKUP_PROD"
        echo "✅ Banco local criado: $BANCO_FIXO"
    else
        echo "❌ Backup de produção não encontrado: $BACKUP_PROD"
        exit 1
    fi
else
    SESSOES=$(sqlite3 "$BANCO_FIXO" "SELECT COUNT(*) FROM sessoes_template" 2>/dev/null || echo "0")
    MANOBRAS=$(sqlite3 "$BANCO_FIXO" "SELECT COUNT(*) FROM cadastro_manobras" 2>/dev/null || echo "0")
    echo "✅ Usando banco local existente: $SESSOES sessões, $MANOBRAS manobras"
fi

# Copiar banco fixo para TODOS os possíveis nomes que o wrangler pode criar
echo "🔄 Sincronizando banco fixo..."
for arquivo in "$BANCO_DIR"/*.sqlite; do
    if [ -f "$arquivo" ] && [ "$arquivo" != "$BANCO_FIXO" ]; then
        # Copiar o banco fixo para sobrescrever qualquer banco que o wrangler criar
        cp "$BANCO_FIXO" "$arquivo"
        echo "   📋 Copiado para: $(basename $arquivo)"
    fi
done

echo ""
echo "🚀 Iniciando API na porta 8787..."
cd worker-airtrust
npx wrangler dev --port 8787 --local --persist-to .wrangler/state --config ../wrangler.dev.toml &
WRANGLER_PID=$!
cd ..

sleep 4

# Garantir que wrangler está usando o banco correto
HASH_BANCO=$(ls -t "$BANCO_DIR"/*.sqlite | grep -v "airtrust-local" | head -1)
if [ -n "$HASH_BANCO" ] && [ -f "$HASH_BANCO" ]; then
    echo "🔄 Aplicando banco fixo ao arquivo criado pelo wrangler..."
    cp "$BANCO_FIXO" "$HASH_BANCO"
    echo "   ✅ Banco sincronizado: $(basename $HASH_BANCO)"
fi

echo ""
echo "🎨 Iniciando Frontend na porta 3000..."
npm run dev > /tmp/vite-dev.log 2>&1 &
VITE_PID=$!

sleep 3

echo ""
echo "✅ Ambiente local iniciado!"
echo ""
echo "📍 URLs:"
echo "   Frontend: http://localhost:3000"
echo "   API:      http://localhost:8787/api"
echo ""
echo "💾 Banco de dados fixo:"
echo "   $BANCO_FIXO"
echo ""
echo "📝 Logs:"
echo "   Frontend: tail -f /tmp/vite-dev.log"
echo ""
echo "🛑 Para parar: pkill -f 'vite|wrangler'"
echo ""
