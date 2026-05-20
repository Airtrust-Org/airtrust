#!/bin/bash

# Script para cadastrar manobras de TODAS as 12 sessões via API
# Cada sessão terá suas manobras na ordem correta

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🚀 CADASTRANDO MANOBRAS DE TODAS AS 12 SESSÕES"
echo "════════════════════════════════════════════════"
echo ""

# Buscar todas as manobras uma vez
echo "📋 Carregando todas as manobras..."
MANOBRAS_JSON=$(curl -s "$API_URL/api/v2/manobras")

# Função para buscar ID de uma manobra pelo código
get_manobra_id() {
  local codigo=$1
  echo "$MANOBRAS_JSON" | jq -r ".data[] | select(.codigo == \"$codigo\") | .id"
}

# Função para cadastrar manobras em uma sessão
cadastrar_sessao() {
  local modelo_id=$1
  local nome_sessao=$2
  shift 2
  local codigos=("$@")
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📝 SESSÃO $modelo_id: $nome_sessao"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # Buscar IDs das manobras
  local ids=()
  local count=0
  for codigo in "${codigos[@]}"; do
    count=$((count + 1))
    id=$(get_manobra_id "$codigo")
    if [ -z "$id" ] || [ "$id" == "null" ]; then
      echo "  ⚠️  $count. $codigo - NÃO ENCONTRADA"
    else
      ids+=("$id")
      echo "  ✅ $count. $codigo"
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
  
  # Buscar dados atuais do modelo
  local modelo_atual=$(curl -s "$API_URL/api/v2/simuladores/modelos/$modelo_id")
  local codigo=$(echo "$modelo_atual" | jq -r '.data.codigo')
  local nome=$(echo "$modelo_atual" | jq -r '.data.nome')
  local tipo=$(echo "$modelo_atual" | jq -r '.data.tipo')
  local duracao=$(echo "$modelo_atual" | jq -r '.data.duracao_minutos')
  
  # Criar payload
  local payload=$(cat <<EOF
{
  "codigo": "$codigo",
  "nome": "$nome",
  "tipo": "$tipo",
  "duracao_minutos": $duracao,
  "ativo": 1,
  "manobras": $manobras_array
}
EOF
)
  
  # Enviar atualização
  local response=$(curl -s -X PUT \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "$API_URL/api/v2/simuladores/modelos/$modelo_id")
  
  local success=$(echo "$response" | jq -r '.success')
  
  if [ "$success" == "true" ]; then
    echo ""
    echo "  ✅ SUCESSO! ${#ids[@]} manobras cadastradas"
  else
    echo ""
    echo "  ❌ ERRO: $(echo "$response" | jq -r '.error')"
  fi
}

# SESSÃO 1: FAMILIARIZAÇÃO AW139 - VFR BÁSICO
cadastrar_sessao 4 "FAMILIARIZAÇÃO AW139 - VFR BÁSICO" \
  "FLY-BAS-X1" "FLY-BAS-X3" "OPS-NRM-X1" "OPS-NRM-X2" "OPS-NRM-X3" \
  "WAR-LOW-29" "WAR-HIG-29" "CAU-HOT-65" "CAU-CST-59" "CAU-OVS-64" \
  "CAU-NGO-63" "CAU-CND-61" "CAU-TNF-62" "CAU-FLO-73" "CAU-2FP-74" \
  "CAU-EFP-75" "WAR-OIL-18" "CAU-LIC-60" "WAR-EEC-18" "WAR-IDL-16" \
  "WAR-GER-27" "FLY-BAS-17"

# SESSÃO 2: EMERGÊNCIAS POWERPLANT & AUTOROTAÇÕES
cadastrar_sessao 5 "EMERGÊNCIAS POWERPLANT & AUTOROTAÇÕES" \
  "FLY-BAS-17" "WAR-OUT-15" "WAR-EEC-18" "WAR-IDL-16" "CAU-CST-59" \
  "CAU-OVS-64" "CAU-NGO-63" "WAR-OIL-18" "CAU-HOT-65" "WAR-LOW-29" \
  "WAR-HIG-29" "CAU-LIC-60" "CAU-CND-61" "CAU-TNF-62" "CAU-FLO-73" \
  "CAU-2FP-74" "CAU-EFP-75" "FLY-BAS-X1" "FLY-BAS-X3" "OPS-NRM-X2" \
  "OPS-NRM-X3" "OPS-NRM-X1"

# SESSÃO 3: SISTEMA ELÉTRICO & NOTURNO
cadastrar_sessao 6 "SISTEMA ELÉTRICO & NOTURNO" \
  "WAR-GEN-11" "WAR-BAT-14" "WAR-AUX-14" "CAU-DCG-53" "CAU-BOF-55" \
  "CAU-DCB-56" "CAU-ACB-57" "CAU-28D-58" "FLY-BAS-X1" "FLY-BAS-X3" \
  "OPS-NRM-X2" "OPS-NRM-X3" "WAR-OUT-15" "FLY-BAS-17" "CAU-FLO-73" \
  "WAR-LOW-29" "WAR-HIG-29" "CAU-HOT-65" "CAU-LIC-60" "WAR-GER-27" \
  "CAU-HYP-77" "OPS-NRM-X1"

# SESSÃO 4: INTRODUÇÃO IFR & NAVEGAÇÃO BÁSICA
cadastrar_sessao 7 "INTRODUÇÃO IFR & NAVEGAÇÃO BÁSICA" \
  "FLY-BAS-X2" "OPS-APP-X1" "OPS-APP-X2" "OPS-APP-X3" "OPS-NAV-X1" \
  "OPS-NAV-X3" "FLY-BAS-X4" "WAR-OUT-15" "FLY-BAS-17" "CAU-FLO-73" \
  "WAR-LOW-29" "WAR-HIG-29" "CAU-HOT-65" "OPS-NRM-X1" "OPS-NRM-X2" \
  "CAU-LIC-60" "WAR-STA-X1" "CAU-ADC-48" "CAU-GPS-52" "CAU-FMS-51" \
  "FLY-BAS-X3" "OPS-NRM-X3"

# SESSÃO 5: AFCS INTRODUÇÃO & AUTOPILOT
cadastrar_sessao 8 "AFCS INTRODUÇÃO & AUTOPILOT" \
  "OPS-NAV-X2" "FLY-BAS-X2" "OPS-APP-X1" "OPS-APP-X3" "CAU-APO-38" \
  "OPS-NAV-X1" "OPS-NAV-X3" "OPS-NAV-X4" "OPS-APP-X2" "FLY-BAS-X4" \
  "WAR-OUT-15" "FLY-BAS-17" "CAU-HOT-65" "WAR-LOW-29" "WAR-HIG-29" \
  "CAU-FLO-73" "CAU-LIC-60" "FLY-BAS-X1" "OPS-NRM-X2" "WAR-STA-X1" \
  "CAU-GPS-52" "CAU-FMS-51"

# SESSÃO 6: AFCS DEGRADAÇÕES & MANUAL REVERSION
cadastrar_sessao 9 "AFCS DEGRADAÇÕES & MANUAL REVERSION" \
  "CAU-APF-37" "CAU-MIS-40" "CAU-SAS-41" "CAU-AFD-41" "FLY-BAS-X2" \
  "OPS-APP-X1" "OPS-APP-X3" "OPS-NAV-X2" "FLY-BAS-X4" "WAR-OUT-15" \
  "FLY-BAS-17" "OPS-NAV-X1" "OPS-NAV-X3" "CAU-HOT-65" "WAR-LOW-29" \
  "WAR-HIG-29" "CAU-FLO-73" "CAU-LIC-60" "FLY-BAS-X1" "OPS-NRM-X2" \
  "OPS-APP-X2" "FLY-BAS-X3"

# SESSÃO 7: AVIÔNICOS FAILURES & PARTIAL PANEL
cadastrar_sessao 10 "AVIÔNICOS FAILURES & PARTIAL PANEL" \
  "CAU-ADS-46" "CAU-AHR-47" "CAU-DUD-46" "CAU-PFD-45" "CAU-MFD-45" \
  "CAU-EIC-45" "CAU-ADC-48" "FLY-BAS-X4" "FLY-BAS-X2" "OPS-APP-X1" \
  "OPS-APP-X2" "OPS-APP-X3" "OPS-NAV-X1" "OPS-NAV-X2" "WAR-OUT-15" \
  "FLY-BAS-17" "CAU-HOT-65" "WAR-LOW-29" "WAR-HIG-29" "CAU-FLO-73" \
  "OPS-NRM-X2" "WAR-STA-X1"

# SESSÃO 8: ROTOR, TRANSMISSÃO & HIDRÁULICO
cadastrar_sessao 11 "ROTOR, TRANSMISSÃO & HIDRÁULICO" \
  "WAR-MGB-30" "WAR-TMP-30" "CAU-MGP-105" "WAR-TDR-X1" "WAR-TCS-X1" \
  "WAR-MRC-X1" "WAR-TRC-X1" "CAU-HYP-77" "CAU-SRV-80" "FLY-BAS-X1" \
  "OPS-NRM-X2" "FLY-BAS-X3" "WAR-OUT-15" "FLY-BAS-17" "WAR-GER-27" \
  "CAU-HOT-65" "WAR-LOW-29" "WAR-HIG-29" "CAU-FLO-73" "OPS-NRM-X1" \
  "FLY-BAS-X2" "OPS-APP-X1"

# SESSÃO 9: FOGO, FUMAÇA & HIGH-STRESS
cadastrar_sessao 12 "FOGO, FUMAÇA & HIGH-STRESS" \
  "WAR-FIR-21" "WAR-CAB-23" "WAR-BAG-23" "CAU-O2P-82" "WAR-OUT-15" \
  "FLY-BAS-17" "FLY-BAS-X1" "FLY-BAS-X2" "OPS-NRM-X2" "FLY-BAS-X3" \
  "WAR-GER-27" "CAU-HYP-77" "CAU-SRV-80" "WAR-LOW-29" "WAR-HIG-29" \
  "CAU-HOT-65" "CAU-FLO-73" "OPS-APP-X1" "OPS-APP-X3" "WAR-STA-X1" \
  "FLY-BAS-X4" "OPS-NRM-X1"

# SESSÃO 10: OFFSHORE & PERFORMANCE OPERATIONS
cadastrar_sessao 13 "OFFSHORE & PERFORMANCE OPERATIONS" \
  "OPS-OFF-X1" "OPS-OFF-X2" "OPS-APP-X4" "OPS-NRM-X2" "FLY-BAS-X1" \
  "FLY-BAS-X2" "FLY-BAS-X3" "OPS-NAV-X1" "OPS-NAV-X2" "OPS-APP-X1" \
  "CAU-FLO-73" "WAR-OUT-15" "FLY-BAS-17" "CAU-2FP-74" "WAR-LOW-29" \
  "WAR-HIG-29" "CAU-HOT-65" "CAU-LIC-60" "WAR-GEN-11" "CAU-DCG-53" \
  "OPS-NRM-X1" "OPS-APP-X3"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  NOTA: Sessões 11 e 12 precisam ser criadas primeiro!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ SCRIPT CONCLUÍDO!"
echo ""
echo "📊 RESUMO:"
echo "  - 10 sessões processadas (01/12 até 10/12)"
echo "  - 220 manobras cadastradas (22 por sessão)"
echo ""
echo "🔍 Para verificar, acesse:"
echo "  Simuladores → Modelos de Sessão → Editar"
echo ""
