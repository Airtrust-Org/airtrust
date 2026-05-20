#!/bin/bash
echo "🔄 Limpando cache do Cloudflare Pages..."
echo ""
echo "📍 URLs para acessar com cache limpo:"
echo "   - https://production.airtrust.pages.dev/qualificacoes?v=$(date +%s)"
echo "   - Use Cmd+Shift+R (Mac) ou Ctrl+Shift+R (Windows) para hard refresh"
echo ""
echo "✅ Último deploy: https://94c0f5e8.airtrust.pages.dev"
echo "✅ API retornando:"
curl -sS "https://airtrust.airtrust.workers.dev/api/qualificacoes/historico?limit=1" | jq '{total: .pagination.total, codigo: .data[0].codigo}'
