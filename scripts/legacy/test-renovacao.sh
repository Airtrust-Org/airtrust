#!/bin/bash
set -e

echo "=== TESTE DE RENOVAÇÃO ==="

# 1. Buscar uma qualificação válida para renovar
echo ""
echo "1. Buscando qualificações válidas para testar..."
QUALIF=$(curl -s "http://localhost:3000/api/qualificacoes/historico?limit=1&status=VALIDA" \
  -H "Authorization: Bearer dev-bypass" | jq -r '.data[0]')

QUALIF_ID=$(echo "$QUALIF" | jq -r '.id')
FUNC_NOME=$(echo "$QUALIF" | jq -r '.funcionario_nome')
QUALIF_NOME=$(echo "$QUALIF" | jq -r '.qualificacao_nome')

echo "   ID: $QUALIF_ID"
echo "   Funcionário: $FUNC_NOME"
echo "   Qualificação: $QUALIF_NOME"

# 2. Renovar
echo ""
echo "2. Renovando qualificação ID $QUALIF_ID..."
RENOVACAO=$(curl -s -X POST "http://localhost:3000/api/qualificacoes/historico/$QUALIF_ID/renovar" \
  -H "Authorization: Bearer dev-bypass" \
  -H "Content-Type: application/json" \
  -d '{"nova_data_conclusao":"2026-01-29"}')

echo "$RENOVACAO" | jq '.'

if [ "$(echo "$RENOVACAO" | jq -r '.success')" != "true" ]; then
  echo "❌ ERRO ao renovar!"
  exit 1
fi

NOVO_ID=$(echo "$RENOVACAO" | jq -r '.data.novo_registro_id')
echo "   ✅ Renovação OK! Novo ID: $NOVO_ID"

# 3. Verificar registro original (deve estar com renovada=1)
echo ""
echo "3. Verificando registro ORIGINAL (ID $QUALIF_ID)..."
ORIGINAL=$(curl -s "http://localhost:3000/api/qualificacoes/historico?limit=100" \
  -H "Authorization: Bearer dev-bypass" | jq -r ".data[] | select(.id == $QUALIF_ID)")

if [ -z "$ORIGINAL" ]; then
  echo "   ⚠️  ORIGINAL NÃO APARECE na listagem!"
else
  echo "   Status: $(echo "$ORIGINAL" | jq -r '.status')"
  echo "   Renovada: $(echo "$ORIGINAL" | jq -r '.renovada')"
  echo "   Código: $(echo "$ORIGINAL" | jq -r '.qualificacao_codigo')"
fi

# 4. Verificar registro NOVO (deve aparecer com renovada=0)
echo ""
echo "4. Verificando registro NOVO (ID $NOVO_ID)..."
NOVO=$(curl -s "http://localhost:3000/api/qualificacoes/historico?limit=100" \
  -H "Authorization: Bearer dev-bypass" | jq -r ".data[] | select(.id == $NOVO_ID)")

if [ -z "$NOVO" ]; then
  echo "   ❌ NOVO REGISTRO NÃO APARECE na listagem!"
  echo ""
  echo "5. Verificando diretamente no banco..."
  # Tentar buscar diretamente
  DIRETO=$(wrangler d1 execute airtrust-db --local --command "SELECT id, funcionario_id, qualificacao_id, qualificacao_codigo, categoria, renovada FROM qualificacoes_historico WHERE id = $NOVO_ID")
  echo "$DIRETO"
else
  echo "   ✅ NOVO REGISTRO aparece!"
  echo "   Status: $(echo "$NOVO" | jq -r '.status')"
  echo "   Renovada: $(echo "$NOVO" | jq -r '.renovada')"
  echo "   Código: $(echo "$NOVO" | jq -r '.qualificacao_codigo')"
  echo "   Categoria: $(echo "$NOVO" | jq -r '.qualificacao_categoria')"
  echo "   Funcionário: $(echo "$NOVO" | jq -r '.funcionario_nome')"
fi

echo ""
echo "=== FIM DO TESTE ==="
