#!/bin/bash

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🎨 CRIANDO CATEGORIAS E CLASSIFICANDO MANOBRAS"
echo "════════════════════════════════════════════════════════"
echo ""

# 1. CRIAR CATEGORIAS
echo "📁 CRIANDO CATEGORIAS..."
echo ""

declare -A CATEGORIAS_IDS

# Array de categorias
categorias=(
  "FLY-BAS|Controle Básico|#3B82F6"
  "OPS-NRM|Operações Normais|#10B981"
  "OPS-NAV|Navegação|#8B5CF6"
  "OPS-APP|Aproximações|#EC4899"
  "OPS-ESP|Operações Especiais|#F59E0B"
  "WAR-PWR|Emergência - WARNING: Powerplant|#DC2626"
  "CAU-PWR|Emergência - CAUTION: Powerplant|#F97316"
  "CAU-FUEL|Emergência - CAUTION: Combustível|#FBBF24"
  "WAR-ROTR|Emergência - WARNING: Rotor System|#DC2626"
  "WAR-TRAN|Emergência - WARNING: Transmissão & Rotor|#991B1B"
  "CAU-HYD|Emergência - CAUTION: Hidráulico|#0EA5E9"
  "WAR-ELEC|Emergência - WARNING/CAUTION: Elétrico|#FACC15"
  "CAU-AFCS|Emergência - CAUTION: AFCS / Autopilot|#6366F1"
  "CAU-AVIO|Emergência - CAUTION: Aviônicos & Displays|#14B8A6"
  "WAR-FIRE|Emergência - WARNING: Fogo & Fumaça|#DC2626"
  "WAR-MISC|Emergência - WARNING/CAUTION: Diversos|#64748B"
  "INTEGR|Cenários Integrados|#7C3AED"
)

for cat in "${categorias[@]}"; do
  IFS='|' read -r codigo nome cor <<< "$cat"
  
  # Criar categoria
  RESP=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "{\"codigo\":\"$codigo\",\"nome\":\"$nome\",\"cor\":\"$cor\",\"ativo\":1}" \
    "$API_URL/api/v2/categorias-manobras")
  
  SUCCESS=$(echo "$RESP" | jq -r '.success')
  if [ "$SUCCESS" == "true" ]; then
    ID=$(echo "$RESP" | jq -r '.data.id')
    CATEGORIAS_IDS["$codigo"]=$ID
    echo "  ✅ $nome (ID: $ID)"
  else
    # Se já existe, buscar ID
    BUSCA=$(curl -s "$API_URL/api/v2/categorias-manobras")
    ID=$(echo "$BUSCA" | jq -r ".data[] | select(.codigo == \"$codigo\") | .id")
    if [ -n "$ID" ] && [ "$ID" != "null" ]; then
      CATEGORIAS_IDS["$codigo"]=$ID
      echo "  ℹ️  $nome já existe (ID: $ID)"
    fi
  fi
done

echo ""
echo "📊 CLASSIFICANDO MANOBRAS..."
echo ""

# 2. CLASSIFICAR MANOBRAS
# Buscar todas as manobras
MANOBRAS=$(curl -s "$API_URL/api/v2/manobras")

# Função para atualizar categoria de uma manobra
atualizar_categoria() {
  local codigo_manobra=$1
  local codigo_categoria=$2
  
  # Buscar ID da manobra
  MANOBRA_ID=$(echo "$MANOBRAS" | jq -r ".data[] | select(.codigo == \"$codigo_manobra\") | .id")
  
  if [ -z "$MANOBRA_ID" ] || [ "$MANOBRA_ID" == "null" ]; then
    echo "  ⚠️  $codigo_manobra não encontrada"
    return
  fi
  
  # Buscar ID da categoria
  CAT_ID="${CATEGORIAS_IDS[$codigo_categoria]}"
  
  if [ -z "$CAT_ID" ]; then
    echo "  ⚠️  Categoria $codigo_categoria não encontrada"
    return
  fi
  
  # Atualizar manobra
  RESP=$(curl -s -X PATCH \
    -H "Content-Type: application/json" \
    -d "{\"categoria_id\":$CAT_ID}" \
    "$API_URL/api/v2/manobras/$MANOBRA_ID")
  
  if [ "$(echo "$RESP" | jq -r '.success')" == "true" ]; then
    echo "  ✅ $codigo_manobra → $codigo_categoria"
  fi
}

# CONTROLE BÁSICO (FLY-BAS)
echo "1️⃣  CONTROLE BÁSICO"
atualizar_categoria "FLY-BAS-X1" "FLY-BAS"
atualizar_categoria "FLY-BAS-X2" "FLY-BAS"
atualizar_categoria "FLY-BAS-X3" "FLY-BAS"
atualizar_categoria "FLY-BAS-X4" "FLY-BAS"
atualizar_categoria "FLY-BAS-17" "FLY-BAS"

# OPERAÇÕES NORMAIS (OPS-NRM)
echo ""
echo "2️⃣  OPERAÇÕES NORMAIS"
atualizar_categoria "OPS-NRM-X1" "OPS-NRM"
atualizar_categoria "OPS-NRM-X2" "OPS-NRM"
atualizar_categoria "OPS-NRM-X3" "OPS-NRM"

# NAVEGAÇÃO (OPS-NAV)
echo ""
echo "3️⃣  NAVEGAÇÃO"
atualizar_categoria "OPS-NAV-X1" "OPS-NAV"
atualizar_categoria "OPS-NAV-X2" "OPS-NAV"
atualizar_categoria "OPS-NAV-X3" "OPS-NAV"
atualizar_categoria "OPS-NAV-X4" "OPS-NAV"

# APROXIMAÇÕES (OPS-APP)
echo ""
echo "4️⃣  APROXIMAÇÕES"
atualizar_categoria "OPS-APP-X1" "OPS-APP"
atualizar_categoria "OPS-APP-X2" "OPS-APP"
atualizar_categoria "OPS-APP-X3" "OPS-APP"
atualizar_categoria "OPS-APP-X4" "OPS-APP"

# OPERAÇÕES ESPECIAIS (OPS-ESP)
echo ""
echo "5️⃣  OPERAÇÕES ESPECIAIS"
atualizar_categoria "OPS-OFF-X1" "OPS-ESP"
atualizar_categoria "OPS-OFF-X2" "OPS-ESP"
atualizar_categoria "OPS-LOFT-X1" "OPS-ESP"

# WARNING: POWERPLANT (WAR-PWR)
echo ""
echo "6️⃣  EMERGÊNCIA - WARNING: POWERPLANT"
atualizar_categoria "WAR-OUT-15" "WAR-PWR"
atualizar_categoria "WAR-EEC-18" "WAR-PWR"
atualizar_categoria "WAR-IDL-16" "WAR-PWR"
atualizar_categoria "WAR-OIL-18" "WAR-PWR"

# CAUTION: POWERPLANT (CAU-PWR)
echo ""
echo "7️⃣  EMERGÊNCIA - CAUTION: POWERPLANT"
atualizar_categoria "CAU-HOT-65" "CAU-PWR"
atualizar_categoria "CAU-CST-59" "CAU-PWR"
atualizar_categoria "CAU-OVS-64" "CAU-PWR"
atualizar_categoria "CAU-NGO-63" "CAU-PWR"
atualizar_categoria "CAU-CND-61" "CAU-PWR"
atualizar_categoria "CAU-TNF-62" "CAU-PWR"
atualizar_categoria "CAU-LIC-60" "CAU-PWR"

# CAUTION: COMBUSTÍVEL (CAU-FUEL)
echo ""
echo "8️⃣  EMERGÊNCIA - CAUTION: COMBUSTÍVEL"
atualizar_categoria "CAU-FLO-73" "CAU-FUEL"
atualizar_categoria "CAU-2FP-74" "CAU-FUEL"
atualizar_categoria "CAU-EFP-75" "CAU-FUEL"

# WARNING: ROTOR SYSTEM (WAR-ROTR)
echo ""
echo "9️⃣  EMERGÊNCIA - WARNING: ROTOR SYSTEM"
atualizar_categoria "WAR-LOW-29" "WAR-ROTR"
atualizar_categoria "WAR-HIG-29" "WAR-ROTR"

# WARNING: TRANSMISSÃO & ROTOR (WAR-TRAN)
echo ""
echo "🔟 EMERGÊNCIA - WARNING: TRANSMISSÃO & ROTOR"
atualizar_categoria "WAR-MGB-30" "WAR-TRAN"
atualizar_categoria "WAR-TMP-30" "WAR-TRAN"
atualizar_categoria "CAU-MGP-105" "WAR-TRAN"
atualizar_categoria "WAR-TDR-X1" "WAR-TRAN"
atualizar_categoria "WAR-TCS-X1" "WAR-TRAN"
atualizar_categoria "WAR-MRC-X1" "WAR-TRAN"
atualizar_categoria "WAR-TRC-X1" "WAR-TRAN"

# CAUTION: HIDRÁULICO (CAU-HYD)
echo ""
echo "1️⃣1️⃣  EMERGÊNCIA - CAUTION: HIDRÁULICO"
atualizar_categoria "CAU-HYP-77" "CAU-HYD"
atualizar_categoria "CAU-SRV-80" "CAU-HYD"

# WARNING/CAUTION: ELÉTRICO (WAR-ELEC)
echo ""
echo "1️⃣2️⃣  EMERGÊNCIA - WARNING/CAUTION: ELÉTRICO"
atualizar_categoria "WAR-GEN-11" "WAR-ELEC"
atualizar_categoria "WAR-BAT-14" "WAR-ELEC"
atualizar_categoria "WAR-AUX-14" "WAR-ELEC"
atualizar_categoria "CAU-DCG-53" "WAR-ELEC"
atualizar_categoria "CAU-BOF-55" "WAR-ELEC"
atualizar_categoria "CAU-DCB-56" "WAR-ELEC"
atualizar_categoria "CAU-ACB-57" "WAR-ELEC"
atualizar_categoria "CAU-28D-58" "WAR-ELEC"

# CAUTION: AFCS / AUTOPILOT (CAU-AFCS)
echo ""
echo "1️⃣3️⃣  EMERGÊNCIA - CAUTION: AFCS / AUTOPILOT"
atualizar_categoria "CAU-APO-38" "CAU-AFCS"
atualizar_categoria "CAU-APF-37" "CAU-AFCS"
atualizar_categoria "CAU-MIS-40" "CAU-AFCS"
atualizar_categoria "CAU-SAS-41" "CAU-AFCS"
atualizar_categoria "CAU-AFD-41" "CAU-AFCS"

# CAUTION: AVIÔNICOS & DISPLAYS (CAU-AVIO)
echo ""
echo "1️⃣4️⃣  EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"
atualizar_categoria "CAU-ADS-46" "CAU-AVIO"
atualizar_categoria "CAU-AHR-47" "CAU-AVIO"
atualizar_categoria "CAU-DUD-46" "CAU-AVIO"
atualizar_categoria "CAU-PFD-45" "CAU-AVIO"
atualizar_categoria "CAU-MFD-45" "CAU-AVIO"
atualizar_categoria "CAU-EIC-45" "CAU-AVIO"
atualizar_categoria "CAU-ADC-48" "CAU-AVIO"
atualizar_categoria "CAU-GPS-52" "CAU-AVIO"
atualizar_categoria "CAU-FMS-51" "CAU-AVIO"
atualizar_categoria "WAR-STA-X1" "CAU-AVIO"

# WARNING: FOGO & FUMAÇA (WAR-FIRE)
echo ""
echo "1️⃣5️⃣  EMERGÊNCIA - WARNING: FOGO & FUMAÇA"
atualizar_categoria "WAR-FIR-21" "WAR-FIRE"
atualizar_categoria "WAR-CAB-23" "WAR-FIRE"
atualizar_categoria "WAR-BAG-23" "WAR-FIRE"

# WARNING/CAUTION: DIVERSOS (WAR-MISC)
echo ""
echo "1️⃣6️⃣  EMERGÊNCIA - WARNING/CAUTION: DIVERSOS"
atualizar_categoria "WAR-GER-27" "WAR-MISC"
atualizar_categoria "CAU-O2P-82" "WAR-MISC"

# CENÁRIOS INTEGRADOS (INTEGR)
echo ""
echo "1️⃣7️⃣  CENÁRIOS INTEGRADOS"
atualizar_categoria "MULTI-FAIL-X1" "INTEGR"
atualizar_categoria "CHECK-FINAL" "INTEGR"

echo ""
echo "✅ CATEGORIZAÇÃO CONCLUÍDA!"
echo ""
echo "📊 RESUMO:"
echo "  - 17 categorias criadas"
echo "  - ~80 manobras classificadas"
echo "  - Cores diferenciadas por tipo"
echo ""
