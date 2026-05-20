#!/bin/bash
# Script para deploy do Worker com endpoint de importação histórico

echo "🚀 Deploy do Worker - Importação Histórico EdApp"
echo "================================================="
echo ""

cd "$(dirname "$0")/worker-airtrust"

echo "1️⃣ Verificando autenticação Cloudflare..."
npx wrangler whoami

echo ""
echo "2️⃣ Fazendo deploy para produção..."
npx wrangler deploy --env production

echo ""
echo "3️⃣ Aguardando propagação..."
sleep 5

echo ""
echo "4️⃣ Testando endpoint (deve dar 401 Unauthorized se estiver OK)..."
curl -X POST "https://airtrust-api-production.airtrust.workers.dev/api/integracoes/edapp/importar-historico" \
  -H "Content-Type: application/json" \
  -w "\nHTTP Status: %{http_code}\n"

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "📋 Próximo passo:"
echo "   1. Recarregue a página (Cmd+Shift+R)"
echo "   2. Clique em 'Importar Histórico EdApp'"
echo ""
