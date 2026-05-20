#!/bin/bash

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🔧 CRIANDO MANOBRAS FALTANTES"
echo "════════════════════════════════════════════════"
echo ""

# Criar MULTI-FAIL-X1
echo "📝 Criando: MULTI-FAIL-X1 - Cenário multi-falhas"
RESPONSE1=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "codigo": "MULTI-FAIL-X1",
    "nome": "Multi-failure scenario - Cenário multi-falhas",
    "categoria": "INTEGRATION",
    "descricao": "Cenário integrado com múltiplas falhas simultâneas",
    "ativo": 1
  }' \
  "$API_URL/api/v2/manobras")

SUCCESS1=$(echo "$RESPONSE1" | jq -r '.success')
if [ "$SUCCESS1" == "true" ]; then
  ID1=$(echo "$RESPONSE1" | jq -r '.data.id')
  echo "  ✅ MULTI-FAIL-X1 criada (ID: $ID1)"
else
  echo "  ⚠️  $(echo "$RESPONSE1" | jq -r '.error')"
fi

echo ""

# Criar CHECK-FINAL
echo "📝 Criando: CHECK-FINAL - Avaliação final integrada"
RESPONSE2=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "codigo": "CHECK-FINAL",
    "nome": "CHECK-FINAL - Avaliação final integrada",
    "categoria": "CHECK",
    "descricao": "Avaliação final completa de proficiência",
    "ativo": 1
  }' \
  "$API_URL/api/v2/manobras")

SUCCESS2=$(echo "$RESPONSE2" | jq -r '.success')
if [ "$SUCCESS2" == "true" ]; then
  ID2=$(echo "$RESPONSE2" | jq -r '.data.id')
  echo "  ✅ CHECK-FINAL criada (ID: $ID2)"
else
  echo "  ⚠️  $(echo "$RESPONSE2" | jq -r '.error')"
fi

echo ""
echo "✅ MANOBRAS CRIADAS!"
echo ""

# Agora adicionar às sessões
if [ "$SUCCESS1" == "true" ] && [ "$SUCCESS2" == "true" ]; then
  echo "🔄 ADICIONANDO MANOBRAS ÀS SESSÕES..."
  echo ""
  
  # Buscar sessão 11
  SESSAO11=$(curl -s "$API_URL/api/v2/simuladores/modelos/16")
  MANOBRAS11=$(echo "$SESSAO11" | jq '.data.manobras')
  
  # Adicionar MULTI-FAIL-X1 como manobra 22
  MANOBRAS11_UPDATED=$(echo "$MANOBRAS11" | jq ". + [{\"manobra_id\": $ID1, \"ordem\": 22, \"obrigatoria\": 1}]")
  
  # Buscar dados da sessão 11
  CODIGO11=$(echo "$SESSAO11" | jq -r '.data.codigo')
  NOME11=$(echo "$SESSAO11" | jq -r '.data.nome')
  TIPO11=$(echo "$SESSAO11" | jq -r '.data.tipo')
  DURACAO11=$(echo "$SESSAO11" | jq -r '.data.duracao_minutos')
  
  # Atualizar sessão 11
  echo "  📝 Atualizando Sessão 11..."
  PAYLOAD11=$(cat <<EOFPAYLOAD
{
  "codigo": "$CODIGO11",
  "nome": "$NOME11",
  "tipo": "$TIPO11",
  "duracao_minutos": $DURACAO11,
  "ativo": 1,
  "manobras": $MANOBRAS11_UPDATED
}
EOFPAYLOAD
)
  
  RESP11=$(curl -s -X PUT \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD11" \
    "$API_URL/api/v2/simuladores/modelos/16")
  
  if [ "$(echo "$RESP11" | jq -r '.success')" == "true" ]; then
    echo "  ✅ Sessão 11 atualizada (22 manobras)"
  fi
  
  echo ""
  
  # Buscar sessão 12
  SESSAO12=$(curl -s "$API_URL/api/v2/simuladores/modelos/17")
  MANOBRAS12=$(echo "$SESSAO12" | jq '.data.manobras')
  
  # Adicionar CHECK-FINAL como manobra 22
  MANOBRAS12_UPDATED=$(echo "$MANOBRAS12" | jq ". + [{\"manobra_id\": $ID2, \"ordem\": 22, \"obrigatoria\": 1}]")
  
  # Buscar dados da sessão 12
  CODIGO12=$(echo "$SESSAO12" | jq -r '.data.codigo')
  NOME12=$(echo "$SESSAO12" | jq -r '.data.nome')
  TIPO12=$(echo "$SESSAO12" | jq -r '.data.tipo')
  DURACAO12=$(echo "$SESSAO12" | jq -r '.data.duracao_minutos')
  
  # Atualizar sessão 12
  echo "  📝 Atualizando Sessão 12..."
  PAYLOAD12=$(cat <<EOFPAYLOAD
{
  "codigo": "$CODIGO12",
  "nome": "$NOME12",
  "tipo": "$TIPO12",
  "duracao_minutos": $DURACAO12,
  "ativo": 1,
  "manobras": $MANOBRAS12_UPDATED
}
EOFPAYLOAD
)
  
  RESP12=$(curl -s -X PUT \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD12" \
    "$API_URL/api/v2/simuladores/modelos/17")
  
  if [ "$(echo "$RESP12" | jq -r '.success')" == "true" ]; then
    echo "  ✅ Sessão 12 atualizada (22 manobras)"
  fi
fi

echo ""
echo "✅ CONCLUÍDO!"
