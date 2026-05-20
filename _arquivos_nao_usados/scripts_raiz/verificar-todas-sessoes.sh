#!/bin/bash

echo "📊 VERIFICANDO TODAS AS SESSÕES"
echo "════════════════════════════════════════════════════════════"
echo ""

for modelo_id in {4..14}; do
  echo "📋 MODELO $modelo_id:"
  
  # Buscar nome do modelo
  NOME=$(npx wrangler d1 execute airtrust-db --remote \
    --command="SELECT codigo, nome FROM sessoes_template WHERE id = $modelo_id" 2>&1 | \
    grep -A1 "codigo" | tail -1 | sed 's/.*: "//;s/".*//')
  
  # Contar manobras
  TOTAL=$(npx wrangler d1 execute airtrust-db --remote \
    --command="SELECT COUNT(*) as total FROM modelo_sessao_manobras WHERE modelo_id = $modelo_id AND deleted_at IS NULL" 2>&1 | \
    grep "total" | grep -v "total_attempts" | sed 's/.*: //;s/[^0-9]//g')
  
  echo "   Total de manobras: $TOTAL"
  echo ""
done

echo "════════════════════════════════════════════════════════════"
