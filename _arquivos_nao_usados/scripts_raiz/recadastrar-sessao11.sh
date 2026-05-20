#!/bin/bash

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🔄 RECADASTRANDO SESSÃO 11..."

# Buscar manobras
MANOBRAS_JSON=$(curl -s "$API_URL/api/v2/manobras")

get_manobra_id() {
  echo "$MANOBRAS_JSON" | jq -r ".data[] | select(.codigo == \"$1\") | .id"
}

# Códigos da Sessão 11
CODIGOS=(
  "OPS-LOFT-X1" "FLY-BAS-X1" "FLY-BAS-X2" "FLY-BAS-X3" "FLY-BAS-X4"
  "FLY-BAS-17" "OPS-NRM-X1" "OPS-NRM-X2" "OPS-NRM-X3" "OPS-NAV-X1"
  "OPS-NAV-X2" "OPS-NAV-X3" "OPS-NAV-X4" "OPS-APP-X1" "OPS-APP-X2"
  "OPS-APP-X3" "OPS-APP-X4" "WAR-OUT-15" "WAR-GEN-11" "CAU-APF-37"
  "CAU-ADS-46" "MULTI-FAIL-X1"
)

ids=()
for codigo in "${CODIGOS[@]}"; do
  id=$(get_manobra_id "$codigo")
  [ -n "$id" ] && [ "$id" != "null" ] && ids+=("$id") && echo "  ✅ $codigo"
done

manobras_array="["
for i in "${!ids[@]}"; do
  [ $i -gt 0 ] && manobras_array+=","
  manobras_array+="{\"manobra_id\":${ids[$i]},\"ordem\":$((i+1)),\"obrigatoria\":1}"
done
manobras_array+="]"

SESSAO=$(curl -s "$API_URL/api/v2/simuladores/modelos/16")
PAYLOAD=$(cat <<EOFPAYLOAD
{
  "codigo": "$(echo "$SESSAO" | jq -r '.data.codigo')",
  "nome": "$(echo "$SESSAO" | jq -r '.data.nome')",
  "tipo": "$(echo "$SESSAO" | jq -r '.data.tipo')",
  "duracao_minutos": 120,
  "ativo": 1,
  "manobras": $manobras_array
}
EOFPAYLOAD
)

RESP=$(curl -s -X PUT -H "Content-Type: application/json" -d "$PAYLOAD" "$API_URL/api/v2/simuladores/modelos/16")
[ "$(echo "$RESP" | jq -r '.success')" == "true" ] && echo "✅ ${#ids[@]} manobras cadastradas" || echo "❌ ERRO"
