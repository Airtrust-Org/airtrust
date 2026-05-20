#!/bin/bash

# Script para aplicar migration 0118 remotamente via curl
# Como wrangler tem problema de permissões, vamos aplicar via SQL direto no dashboard

echo "=============================================="
echo "  MIGRATION 0118: aeronave → modelo_aeronave_id"
echo "=============================================="
echo ""
echo "⚠️  ATENÇÃO: Execute os comandos SQL abaixo no Cloudflare Dashboard"
echo "    https://dash.cloudflare.com/ > D1 > airtrust-db > Console"
echo ""
echo "1. Criar nova tabela com modelo_aeronave_id:"
echo ""
cat worker-airtrust/migrations/0118_rename_aeronave_to_modelo_aeronave_id.sql
echo ""
echo "=============================================="
echo ""
echo "Ou use este comando para executar via wrangler (se credenciais OK):"
echo "npx wrangler d1 execute airtrust-db --remote --command=\"\$(cat worker-airtrust/migrations/0118_rename_aeronave_to_modelo_aeronave_id.sql)\""
