#!/bin/bash

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🔍 VERIFICANDO MANOBRAS DA SESSÃO 1..."
echo ""

# Buscar manobras diretamente do banco via query
echo "📊 Consultando banco de dados..."
echo ""

# Como não temos acesso direto ao banco, vamos recarregar as manobras
echo "🔄 RECADASTRANDO MANOBRAS DA SESSÃO 1..."
echo ""

# Buscar todas as manobras
MANOBRAS_JSON=$(curl -s "$API_URL/api/v2/manobras")

# Função para buscar ID
get_manobra_id() {
  local codigo=$1
  echo "$MANOBRAS_JSON" | jq -r ".data[] | select(.codigo == \"$codigo\") | .id"
}

# Códigos da Sessão 1
CODIGOS=(
  "FLY-BAS-X1" "FLY-BAS-X3" "OPS-NRM-X1" "OPS-NRM-X2" "OPS-NRM-X3"
  "WAR-LOW-29" "WAR-HIG-29" "CAU-HOT-65" "CAU-CST-59" "CAU-OVS-64"
  "CAU-NGO-63" "CAU-CND-61" "CAU-TNF-62" "CAU-FLO-73" "CAU-2FP-74"
  "CAU-EFP-75" "WAR-OIL-18" "CAU-LIC-60" "WAR-EEC-18" "WAR-IDL-16"
  "WAR-GER-27" "FLY-BAS-17"
)

# Buscar IDs
ids=()
for codigo in "${CODIGOS[@]}"; do
  id=$(get_manobra_id "$codigo")
  if [ -n "$id" ] && [ "$id" != "null" ]; then
    ids+=("$id")
    echo "  ✅ $codigo → ID: $id"
  fi
done

echo ""
echo "📦 Total de manobras encontradas: ${#ids[@]}"
echo ""

# Criar array JSON
manobras_array="["
for i in "${!ids[@]}"; do
  if [ $i -gt 0 ]; then
    manobras_array+=","
  fi
  manobras_array+="{\"manobra_id\":${ids[$i]},\"ordem\":$((i+1)),\"obrigatoria\":1}"
done
manobras_array+="]"

# Buscar dados atuais
SESSAO=$(curl -s "$API_URL/api/v2/simuladores/modelos/4")
CODIGO=$(echo "$SESSAO" | jq -r '.data.codigo')
NOME=$(echo "$SESSAO" | jq -r '.data.nome')
TIPO=$(echo "$SESSAO" | jq -r '.data.tipo')

# Criar payload
PAYLOAD=$(cat <<EOFPAYLOAD
{
  "codigo": "$CODIGO",
  "nome": "$NOME",
  "tipo": "$TIPO",
  "duracao_minutos": 120,
  "ativo": 1,
  "manobras": $manobras_array
}
EOFPAYLOAD
)

echo "🚀 Atualizando Sessão 1..."
RESP=$(curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$API_URL/api/v2/simuladores/modelos/4")

if [ "$(echo "$RESP" | jq -r '.success')" == "true" ]; then
  echo "  ✅ SUCESSO! ${#ids[@]} manobras cadastradas"
  echo ""
  echo "🔍 Verificando..."
  VERIF=$(curl -s "$API_URL/api/v2/simuladores/modelos/4")
  TOTAL=$(echo "$VERIF" | jq '.data.manobras | length')
  echo "  📊 Manobras no banco: $TOTAL"
else
  echo "  ❌ ERRO: $(echo "$RESP" | jq -r '.error')"
fi

echo ""
echo "✅ CONCLUÍDO!"
