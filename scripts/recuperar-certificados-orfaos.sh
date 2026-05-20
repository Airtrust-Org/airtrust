#!/bin/bash

# 🔧 MIGRATION: Recuperar certificados antigos que não foram linkados
# Problema: Uploads feitos ANTES do commit 31a5811a não linkaram certificado_arquivo_id
# Solução: Buscar documentos CERTIFICADO_QUALIFICACAO órfãos e linká-los às qualificações

set -e

API_BASE="https://airtrust-api-production.airtrust.workers.dev/api"
TOKEN=$(cat ~/.airtrust_token 2>/dev/null || echo "")

if [ -z "$TOKEN" ]; then
  echo "❌ Token não encontrado em ~/.airtrust_token"
  echo "Execute: cat ~/.airtrust_token"
  exit 1
fi

echo "🔧 MIGRATION: Recuperar certificados órfãos"
echo "=========================================="
echo ""
echo "Token: ${TOKEN:0:20}..."
echo ""

# Script SQL para encontrar certificados órfãos
# Lógica:
# 1. Buscar documentos com nome_arquivo começando com CERT-
# 2. Verificar qual qualificação_historico deveria ter esse certificado
# 3. Link se o funcionario_id combinar

cat > /tmp/link-certificados.sql << 'EOF'
-- 1. Ver certificados órfãos
SELECT 
  d.id,
  d.nome_arquivo,
  d.funcionario_id,
  d.created_at,
  COUNT(*) as total
FROM documentos d
WHERE d.deleted_at IS NULL
  AND d.nome_arquivo LIKE 'CERT-%'
  AND d.id NOT IN (
    SELECT certificado_arquivo_id FROM qualificacoes_historico 
    WHERE certificado_arquivo_id IS NOT NULL AND deleted_at IS NULL
  )
GROUP BY d.funcionario_id
ORDER BY d.created_at DESC;

-- 2. Tentar fazer matching: extrair código da qualificação do nome do arquivo
-- Nome formato: CERT-{NOME}-{CODIGO}-{CPF}-{DATA}-{UUID}.pdf
-- Exemplo: CERT-Fernando-D2-68712920123-20230930-cb3548e0.pdf

-- Para cada funcionário, buscar qualificações que:
-- a) Não têm certificado linkado
-- b) O código dela combina com o código do arquivo
-- c) A data de conclusão é próxima à data do arquivo

SELECT 
  d.id as documento_id,
  d.nome_arquivo,
  d.funcionario_id,
  d.created_at as documento_data,
  qh.id as historico_id,
  qh.codigo,
  qh.data_conclusao,
  EXTRACT(YEAR FROM d.created_at) * 10000 + 
  EXTRACT(MONTH FROM d.created_at) * 100 + 
  EXTRACT(DAY FROM d.created_at) as data_arquivo_int,
  EXTRACT(YEAR FROM qh.data_conclusao) * 10000 + 
  EXTRACT(MONTH FROM qh.data_conclusao) * 100 + 
  EXTRACT(DAY FROM qh.data_conclusao) as data_conclusao_int,
  ABS(
    EXTRACT(YEAR FROM d.created_at) * 10000 + 
    EXTRACT(MONTH FROM d.created_at) * 100 + 
    EXTRACT(DAY FROM d.created_at) -
    (EXTRACT(YEAR FROM qh.data_conclusao) * 10000 + 
     EXTRACT(MONTH FROM qh.data_conclusao) * 100 + 
     EXTRACT(DAY FROM qh.data_conclusao))
  ) as dias_diferenca
FROM documentos d
LEFT JOIN qualificacoes_historico qh 
  ON qh.funcionario_id = d.funcionario_id
  AND qh.certificado_arquivo_id IS NULL
  AND qh.deleted_at IS NULL
  AND qh.codigo = SUBSTR(d.nome_arquivo, INSTR(d.nome_arquivo, '-') + 1, 
                         INSTR(SUBSTR(d.nome_arquivo, INSTR(d.nome_arquivo, '-') + 1), '-') - 1)
WHERE d.deleted_at IS NULL
  AND d.nome_arquivo LIKE 'CERT-%'
  AND d.id NOT IN (
    SELECT certificado_arquivo_id FROM qualificacoes_historico 
    WHERE certificado_arquivo_id IS NOT NULL AND deleted_at IS NULL
  )
ORDER BY d.funcionario_id, dias_diferenca ASC;
EOF

echo "📋 Analisando certificados órfãos..."
echo ""
echo "Observe:"
echo "- documento_id: ID do arquivo em documentos"
echo "- historico_id: ID da qualificação_historico a linkar"
echo "- dias_diferenca: quanto tempo entre upload e data de conclusão"
echo ""
echo "Se dias_diferenca < 30, é muito provavelmente o mesmo certificado"
echo ""

# Executar query localmente (se tem sqlite3)
if command -v sqlite3 &> /dev/null && [ -f ".wrangler/state/d1/DB_prod.sqlite" ]; then
  echo "Executando contra banco local..."
  sqlite3 .wrangler/state/d1/DB_prod.sqlite < /tmp/link-certificados.sql
else
  echo "⚠️  Banco SQLite local não encontrado"
  echo "Para linkar manualmente, use um dos métodos:"
  echo ""
  echo "1. Via Admin Dashboard (melhor interface)"
  echo "   - Acesse: https://airtrust.online/admin"
  echo "   - Menu: Ferramentas → Recuperar Certificados Órfãos"
  echo ""
  echo "2. Via API (curl)"
  echo "   curl -X POST '${API_BASE}/admin/linkar-certificados-orfaos' \\"
  echo "     -H 'Authorization: Bearer \${TOKEN}' \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{ \"sim_tenho_certeza\": true }'"
  echo ""
  echo "3. Manualmente no banco:"
  echo "   UPDATE qualificacoes_historico"
  echo "   SET certificado_arquivo_id = {documento_id}"
  echo "   WHERE id = {historico_id}"
  echo ""
fi

echo ""
echo "✅ Para confirmar, clique no ícone verde do certificado novamente"
