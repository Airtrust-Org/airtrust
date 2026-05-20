#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "🔄 Clonando dados CORRETOS da produção para o banco local..."

# 1. Exportar modelos_sessao da produção
echo "📥 Exportando modelos_sessao da produção..."
MODELOS_JSON=$(curl -s "https://airtrust.airtrust.workers.dev/api/simuladores/modelos")

# Extrair dados e criar SQL
echo "$MODELOS_JSON" | jq -r '.data[] | 
"INSERT INTO modelos_sessao (codigo, nome, tipo, descricao, duracao_estimada, ordem_no_treinamento, ativo) 
VALUES (\"\(.codigo)\", \"\(.nome)\", \"inicial\", \"\(.descricao // "")\", \(.duracao_estimada // .duracao_minutos // 120), \(.ordem_no_treinamento // .sessao_numero // 1), 1);"' > /tmp/modelos_insert.sql

# 2. Inserir no banco local
echo "📝 Inserindo modelos no banco local..."
npx wrangler d1 execute airtrust-db-dev --config wrangler.dev.toml --local --file /tmp/modelos_insert.sql

# 3. Verificar
COUNT=$(npx wrangler d1 execute airtrust-db-dev --config wrangler.dev.toml --local --command "SELECT COUNT(*) as c FROM modelos_sessao" | grep -o '"c":[0-9]*' | cut -d: -f2 || echo 0)

echo "✅ Clonagem concluída: $COUNT modelos no banco local"
echo "🎯 Agora execute: npm run dev:all"
