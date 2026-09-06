#!/bin/bash
# ============================================================
# Script: test-reatividade.sh
# Objetivo: Validar integração reativa da view qualificacoes_historico_v
# Data: 2025-11-21
# ============================================================
set -euo pipefail

API_BASE="${API:?Defina API explicitamente para um ambiente NAO produtivo}"
EMAIL="${ADMIN_EMAIL:?Defina ADMIN_EMAIL por ambiente}"
SENHA="${ADMIN_PASSWORD:?Defina ADMIN_PASSWORD por ambiente}"

case "$API_BASE" in
  *://api.airtrust.online*|*://airtrust-api.airtrust.workers.dev*)
    echo "ERRO: test-reatividade.sh faz PUT e e proibido contra producao." >&2
    exit 2
    ;;
esac

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "🧪 TESTE DE REATIVIDADE - VIEW INTEGRADA"

TOKEN=$(curl -s -X POST "$API_BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\",\"senha\":\"$SENHA\"}" | jq -r '.data.accessToken')
if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}Falha ao obter token. Verifique credenciais.${NC}"; exit 1
fi

echo "1️⃣ Buscando 1 tipo existente..."
TIPO=$(curl -s "$API_BASE/api/qualificacoes/tipos?limit=1" -H "Authorization: Bearer $TOKEN" | jq '.data[0]')
TIPO_ID=$(echo "$TIPO" | jq -r '.id')
NOME_ORIGINAL=$(echo "$TIPO" | jq -r '.nome')
CODIGO_ORIGINAL=$(echo "$TIPO" | jq -r '.codigo')
if [ "$TIPO_ID" = "null" ]; then echo -e "${RED}Nenhum tipo retornado.${NC}"; exit 1; fi

echo "   ID: $TIPO_ID"
echo "   Nome: $NOME_ORIGINAL"
echo "   Código: $CODIGO_ORIGINAL"

echo "2️⃣ Verificando histórico ANTES..."
HIST_ANTES=$(curl -s "$API_BASE/api/qualificacoes/historico?qualificacao_id=$TIPO_ID&limit=1" -H "Authorization: Bearer $TOKEN" | jq '.data[0]')
NOME_HIST_ANTES=$(echo "$HIST_ANTES" | jq -r '.qualificacao_nome')
CODIGO_HIST_ANTES=$(echo "$HIST_ANTES" | jq -r '.qualificacao_codigo')
echo "   Nome histórico: $NOME_HIST_ANTES"
echo "   Código histórico: $CODIGO_HIST_ANTES"

echo "3️⃣ Alterando tipo (nome + código)..."
NOVO_NOME="$NOME_ORIGINAL [TESTE REATIVIDADE]"
NOVO_CODIGO="${CODIGO_ORIGINAL}-TEST"

curl -s -X PUT "$API_BASE/api/qualificacoes/tipos/$TIPO_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"nome\":\"$NOVO_NOME\",\"codigo\":\"$NOVO_CODIGO\"}" > /dev/null

echo -e "${YELLOW}   Tipo atualizado.${NC}"

sleep 1

echo "4️⃣ Verificando histórico DEPOIS..."
HIST_DEPOIS=$(curl -s "$API_BASE/api/qualificacoes/historico?qualificacao_id=$TIPO_ID&limit=1" -H "Authorization: Bearer $TOKEN" | jq '.data[0]')
NOME_HIST_DEPOIS=$(echo "$HIST_DEPOIS" | jq -r '.qualificacao_nome')
CODIGO_HIST_DEPOIS=$(echo "$HIST_DEPOIS" | jq -r '.qualificacao_codigo')

echo "   Nome histórico: $NOME_HIST_DEPOIS"
echo "   Código histórico: $CODIGO_HIST_DEPOIS"

SUCCESS=0
if [ "$NOME_HIST_DEPOIS" = "$NOVO_NOME" ] && [ "$CODIGO_HIST_DEPOIS" = "$NOVO_CODIGO" ]; then
  echo -e "${GREEN}✅ INTEGRAÇÃO REATIVA FUNCIONANDO${NC}"; SUCCESS=1
else
  echo -e "${RED}❌ INTEGRAÇÃO NÃO REFLETIU ALTERAÇÃO${NC}";
  echo "Esperado nome: $NOVO_NOME | Obtido: $NOME_HIST_DEPOIS"
  echo "Esperado código: $NOVO_CODIGO | Obtido: $CODIGO_HIST_DEPOIS"
fi

echo "5️⃣ Revertendo alterações..."
curl -s -X PUT "$API_BASE/api/qualificacoes/tipos/$TIPO_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"nome\":\"$NOME_ORIGINAL\",\"codigo\":\"$CODIGO_ORIGINAL\"}" > /dev/null

echo -e "${GREEN}Reversão completa.${NC}"

if [ $SUCCESS -eq 1 ]; then exit 0; else exit 2; fi
