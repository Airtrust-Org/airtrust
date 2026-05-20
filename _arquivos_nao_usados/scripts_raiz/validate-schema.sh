#!/bin/bash

echo "🗄️  VALIDANDO SCHEMA DO BANCO DE DADOS..."
echo ""

echo "📋 Tabela: funcionarios"
npx wrangler d1 execute airtrust-db --remote \
  --command="PRAGMA table_info(funcionarios);" 2>/dev/null | \
  grep -E "is_instrutor|is_checador|matricula" | \
  sed 's/^/  ✅ /'

echo ""
echo "📋 Tabela: empresas"
npx wrangler d1 execute airtrust-db --remote \
  --command="PRAGMA table_info(empresas);" 2>/dev/null | \
  grep -E "logo_url|nome" | \
  sed 's/^/  ✅ /'

echo ""
echo "📋 Tabela: certificados"
npx wrangler d1 execute airtrust-db --remote \
  --command="PRAGMA table_info(certificados);" 2>/dev/null | \
  grep -E "arquivo_r2_key|arquivo_url|uploaded_at" | \
  sed 's/^/  ✅ /'

echo ""
echo "📋 Tabela: fichas_sessao"
npx wrangler d1 execute airtrust-db --remote \
  --command="PRAGMA table_info(fichas_sessao);" 2>/dev/null | \
  grep -E "pdf_url|empresa_id" | \
  sed 's/^/  ✅ /'

echo ""
echo "📋 Tabela: manobras"
npx wrangler d1 execute airtrust-db --remote \
  --command="PRAGMA table_info(manobras);" 2>/dev/null | \
  grep -E "ordem|codigo" | \
  sed 's/^/  ✅ /'
