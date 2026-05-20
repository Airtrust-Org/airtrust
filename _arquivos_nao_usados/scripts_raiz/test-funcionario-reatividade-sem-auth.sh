#!/usr/bin/env bash
set -euo pipefail

# Teste de reatividade entre tabela funcionarios e view qualificacoes_historico_v
# VERSÃO SEM AUTENTICAÇÃO (para desenvolvimento com auth desabilitado)
# Requisitos: jq instalado, API em $API_URL

API_URL=${API_URL:-"https://airtrust-api-production.airtrust.workers.dev/api"}

if ! command -v jq >/dev/null 2>&1; then
  echo "[ERRO] jq não encontrado. Instale com: brew install jq" >&2
  exit 1
fi

echo "==================================="
echo "🧪 TESTE REATIVIDADE FUNCIONÁRIOS"
echo "==================================="
echo ""
echo "Testando: funcionarios table -> qualificacoes_historico_v view"
echo "API: $API_URL"
echo ""

echo "Passo 1: Obtendo um funcionario_cpf a partir da view..."
RESPONSE=$(curl -s "$API_URL/qualificacoes/historico?limit=1")
echo "Response: $(echo "$RESPONSE" | jq -c '.')"

FUNC_CPF=$(echo "$RESPONSE" | jq -r '.data[0].funcionario_cpf // empty')
if [ -z "$FUNC_CPF" ] || [ "$FUNC_CPF" = "null" ]; then
  echo "❌ [FALHA] Não foi possível obter funcionario_cpf da view."
  echo "   Dados retornados: $(echo "$RESPONSE" | jq -c '.data[0] // "vazio"')"
  exit 1
fi
echo "✅ Funcionario alvo (CPF): $FUNC_CPF"
echo ""

echo "Passo 2: Buscando ID e nome original do funcionário pelo CPF..."
# Remover pontos e traços do CPF para busca
FUNC_CPF_CLEAN=$(echo "$FUNC_CPF" | tr -d '.-')
echo "   CPF formatado: $FUNC_CPF -> CPF limpo: $FUNC_CPF_CLEAN"

# Buscar funcionário por CPF limpo
RESPONSE_FUNC=$(curl -s "$API_URL/funcionarios?limit=100")
FUNC_DATA=$(echo "$RESPONSE_FUNC" | jq -r --arg cpf "$FUNC_CPF_CLEAN" '.data[] | select(.cpf == $cpf)')

if [ -z "$FUNC_DATA" ]; then
  echo "❌ [FALHA] Não foi possível encontrar funcionário com CPF $FUNC_CPF_CLEAN"
  exit 1
fi

FUNC_ID=$(echo "$FUNC_DATA" | jq -r '.id')
NOME_ANTES=$(echo "$FUNC_DATA" | jq -r '.nome')

if [ -z "$FUNC_ID" ] || [ "$FUNC_ID" = "null" ]; then
  echo "❌ [FALHA] Não foi possível obter ID do funcionário."
  exit 1
fi

if [ -z "$NOME_ANTES" ] || [ "$NOME_ANTES" = "null" ]; then
  echo "❌ [FALHA] Não foi possível obter nome atual."
  exit 1
fi
echo "✅ Funcionário ID: $FUNC_ID"
echo "✅ Nome antes: $NOME_ANTES"
echo ""

NOVO_NOME="${NOME_ANTES} (TesteReativo)"
echo "Passo 3: Atualizando nome do funcionário para: $NOVO_NOME"
UPDATE_RESPONSE=$(curl -s -X PUT -H 'Content-Type: application/json' \
  -d '{"nome":"'"$NOVO_NOME"'"}' "$API_URL/funcionarios/$FUNC_ID")
echo "   Response: $(echo "$UPDATE_RESPONSE" | jq -c '.')"
sleep 2

echo ""
echo "Passo 4: Consultando novamente a view integrada..."
VIEW_RESPONSE=$(curl -s "$API_URL/qualificacoes/historico?funcionario_cpf=$FUNC_CPF&limit=1")
NOME_VIEW=$(echo "$VIEW_RESPONSE" | jq -r '.data[0].funcionario_nome // empty')
echo "   Nome na view após atualização: $NOME_VIEW"

echo ""
if [ "$NOME_VIEW" = "$NOVO_NOME" ]; then
  echo "✅ [SUCESSO] Reatividade confirmada: alteração refletiu na view!"
  RESULT=0
else
  echo "❌ [FALHA] Nome na view não mudou conforme esperado."
  echo "   Esperado: $NOVO_NOME"
  echo "   Obtido: $NOME_VIEW"
  RESULT=1
fi

echo ""
echo "Passo 5: Revertendo nome para estado original..."
REVERT_RESPONSE=$(curl -s -X PUT -H 'Content-Type: application/json' \
  -d '{"nome":"'"$NOME_ANTES"'"}' "$API_URL/funcionarios/$FUNC_ID")
echo "   Response: $(echo "$REVERT_RESPONSE" | jq -c '.')"
sleep 2

VIEW_REVERT_RESPONSE=$(curl -s "$API_URL/qualificacoes/historico?funcionario_cpf=$FUNC_CPF&limit=1")
NOME_VIEW_REVERT=$(echo "$VIEW_REVERT_RESPONSE" | jq -r '.data[0].funcionario_nome // empty')
echo "   Nome na view após revert: $NOME_VIEW_REVERT"

echo ""
if [ "$NOME_VIEW_REVERT" = "$NOME_ANTES" ]; then
  echo "✅ [OK] Reversão aplicada com sucesso."
else
  echo "⚠️  [ATENÇÃO] Reversão não refletiu imediatamente."
  echo "   Esperado: $NOME_ANTES"
  echo "   Obtido: $NOME_VIEW_REVERT"
fi

echo ""
echo "==================================="
if [ $RESULT -eq 0 ]; then
  echo "🎉 TESTE PASSOU!"
else
  echo "❌ TESTE FALHOU"
fi
echo "==================================="

exit $RESULT
