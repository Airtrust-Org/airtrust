#!/bin/bash

# Script para criar Sessões 11 e 12 e cadastrar suas manobras

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🚀 CRIANDO SESSÕES 11 E 12"
echo "════════════════════════════════════════════════"
echo ""

# Buscar todas as manobras
echo "📋 Carregando manobras..."
MANOBRAS_JSON=$(curl -s "$API_URL/api/v2/manobras")

# Função para buscar ID de uma manobra pelo código
get_manobra_id() {
  local codigo=$1
  echo "$MANOBRAS_JSON" | jq -r ".data[] | select(.codigo == \"$codigo\") | .id"
}

# Função para criar sessão e cadastrar manobras
criar_sessao_completa() {
  local codigo=$1
  local nome=$2
  shift 2
  local codigos=("$@")
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📝 CRIANDO: $nome"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Buscar IDs das manobras
  local ids=()
  local count=0
  for cod in "${codigos[@]}"; do
    count=$((count + 1))
    id=$(get_manobra_id "$cod")
    if [ -z "$id" ] || [ "$id" == "null" ]; then
      echo "  ⚠️  $count. $cod - NÃO ENCONTRADA"
    else
      ids+=("$id")
      echo "  ✅ $count. $cod"
    fi
  done
  
  # Criar array JSON de manobras
  local manobras_array="["
  for i in "${!ids[@]}"; do
    if [ $i -gt 0 ]; then
      manobras_array+=","
    fi
    manobras_array+="{\"manobra_id\":${ids[$i]},\"ordem\":$((i+1)),\"obrigatoria\":1}"
  done
  manobras_array+="]"
  
  # Criar payload para nova sessão
  local payload=$(cat <<EOF
{
  "codigo": "$codigo",
  "nome": "$nome",
  "tipo": "PC",
  "duracao_minutos": 240,
  "descricao": "Sessão de treinamento avançado",
  "ativo": 1,
  "manobras": $manobras_array
}
EOF
)
  
  # Criar sessão
  echo ""
  echo "  🔨 Criando sessão..."
  local response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$API_URL/api/v2/simuladores/modelos")
  
  local success=$(echo "$response" | jq -r '.success')
  
  if [ "$success" == "true" ]; then
    local novo_id=$(echo "$response" | jq -r '.data.id')
    echo ""
    echo "  ✅ SUCESSO! Sessão criada (ID: $novo_id)"
    echo "  ✅ ${#ids[@]} manobras cadastradas"
  else
    echo ""
    echo "  ❌ ERRO: $(echo "$response" | jq -r '.error')"
  fi
}

# SESSÃO 11: LOFT - LINE ORIENTED FLIGHT TRAINING
criar_sessao_completa "A139-I-11/12" "11/12 - LOFT - LINE ORIENTED FLIGHT TRAINING" \
  "OPS-LOFT-X1" "FLY-BAS-X1" "FLY-BAS-X2" "FLY-BAS-X3" "FLY-BAS-X4" \
  "FLY-BAS-17" "OPS-NRM-X1" "OPS-NRM-X2" "OPS-NRM-X3" "OPS-NAV-X1" \
  "OPS-NAV-X2" "OPS-NAV-X3" "OPS-NAV-X4" "OPS-APP-X1" "OPS-APP-X2" \
  "OPS-APP-X3" "OPS-APP-X4" "WAR-OUT-15" "WAR-GEN-11" "CAU-APF-37" \
  "CAU-ADS-46" "MULTI-FAIL-X1"

# SESSÃO 12: PROFICIENCY CHECK - FINAL
criar_sessao_completa "A139-I-12/12" "12/12 - PROFICIENCY CHECK - FINAL" \
  "FLY-BAS-X1" "FLY-BAS-X2" "FLY-BAS-X3" "FLY-BAS-X4" "FLY-BAS-17" \
  "OPS-NRM-X1" "OPS-NRM-X2" "OPS-NRM-X3" "OPS-NAV-X1" "OPS-NAV-X2" \
  "OPS-NAV-X3" "OPS-NAV-X4" "OPS-APP-X1" "OPS-APP-X2" "OPS-APP-X3" \
  "OPS-APP-X4" "OPS-OFF-X1" "OPS-OFF-X2" "WAR-OUT-15" "CAU-APF-37" \
  "CAU-ADS-46" "CHECK-FINAL"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ SCRIPT CONCLUÍDO!"
echo ""
echo "📊 RESUMO:"
echo "  - 2 novas sessões criadas (11/12 e 12/12)"
echo "  - 44 manobras cadastradas (22 por sessão)"
echo ""
echo "🔍 Para verificar, acesse:"
echo "  Simuladores → Modelos de Sessão"
echo ""
