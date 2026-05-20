#!/bin/bash

# Script para ver logs do worker em tempo real
# Útil para debugar erros ao gerar certificado

echo "🔍 Monitorando logs do worker em produção..."
echo ""
echo "Abra outra aba/terminal e execute:"
echo "  curl -X POST https://api.airtrust.com.br/api/qualificacoes/historico/123/certificados/gerar \\"
echo "    -H 'Authorization: Bearer \$TOKEN'"
echo ""
echo "Os logs abaixo vão mostrar o que está acontecendo..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

wrangler tail airtrust-api-production --format json 2>&1 | grep -E "\[GERAR PDF\]|Error|error|❌|✅" | while read -r line; do
  echo "$line"
done
