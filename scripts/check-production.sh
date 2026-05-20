#!/bin/bash

echo "🔍 Verificando produção..."
echo ""

echo "📊 Status do cache:"
curl -I https://production.airtrust.pages.dev 2>&1 | grep -E "cf-cache-status|age|cache-control|HTTP"

echo ""
echo "📦 Bundle servido:"
curl -s https://production.airtrust.pages.dev | grep -o 'src="/assets/index-[^"]*"' | head -1

echo ""
echo "✅ Se o bundle mudou e cf-cache-status for MISS ou DYNAMIC, funcionou!"
echo "⏳ Se ainda for HIT com bundle antigo, aguarde mais 1-2 minutos"
