#!/bin/bash

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🎨 CLASSIFICANDO MANOBRAS POR CATEGORIA"
echo "════════════════════════════════════════"
echo ""

# Buscar todas as manobras
echo "📋 Carregando manobras..."
MANOBRAS=$(curl -s "$API_URL/api/v2/manobras")
echo "✅ $(echo "$MANOBRAS" | jq '.data | length') manobras carregadas"
echo ""

# Contador
TOTAL=0
SUCESSO=0

# Função para atualizar categoria
atualizar() {
  local codigo=$1
  local categoria=$2
  
  TOTAL=$((TOTAL + 1))
  
  ID=$(echo "$MANOBRAS" | jq -r ".data[] | select(.codigo == \"$codigo\") | .id")
  
  if [ -z "$ID" ] || [ "$ID" == "null" ]; then
    echo "  ⚠️  $codigo não encontrada"
    return
  fi
  
  RESP=$(curl -s -X PATCH \
    -H "Content-Type: application/json" \
    -d "{\"categoria\":\"$categoria\"}" \
    "$API_URL/api/v2/manobras/$ID")
  
  if [ "$(echo "$RESP" | jq -r '.success')" == "true" ]; then
    SUCESSO=$((SUCESSO + 1))
    echo "  ✅ $codigo"
  fi
}

# 1. CONTROLE BÁSICO
echo "1️⃣  CONTROLE BÁSICO (FLY-BAS)"
atualizar "FLY-BAS-X1" "FLY-BAS"
atualizar "FLY-BAS-X2" "FLY-BAS"
atualizar "FLY-BAS-X3" "FLY-BAS"
atualizar "FLY-BAS-X4" "FLY-BAS"
atualizar "FLY-BAS-17" "FLY-BAS"

# 2. OPERAÇÕES NORMAIS
echo ""
echo "2️⃣  OPERAÇÕES NORMAIS (OPS-NRM)"
atualizar "OPS-NRM-X1" "OPS-NRM"
atualizar "OPS-NRM-X2" "OPS-NRM"
atualizar "OPS-NRM-X3" "OPS-NRM"

# 3. NAVEGAÇÃO
echo ""
echo "3️⃣  NAVEGAÇÃO (OPS-NAV)"
atualizar "OPS-NAV-X1" "OPS-NAV"
atualizar "OPS-NAV-X2" "OPS-NAV"
atualizar "OPS-NAV-X3" "OPS-NAV"
atualizar "OPS-NAV-X4" "OPS-NAV"

# 4. APROXIMAÇÕES
echo ""
echo "4️⃣  APROXIMAÇÕES (OPS-APP)"
atualizar "OPS-APP-X1" "OPS-APP"
atualizar "OPS-APP-X2" "OPS-APP"
atualizar "OPS-APP-X3" "OPS-APP"
atualizar "OPS-APP-X4" "OPS-APP"

# 5. OPERAÇÕES ESPECIAIS
echo ""
echo "5️⃣  OPERAÇÕES ESPECIAIS (OPS-ESP)"
atualizar "OPS-OFF-X1" "OPS-ESP"
atualizar "OPS-OFF-X2" "OPS-ESP"
atualizar "OPS-LOFT-X1" "OPS-ESP"

# 6. EMG WARNING POWERPLANT
echo ""
echo "6️⃣  EMERGÊNCIA WARNING POWERPLANT (EMG-WAR-PWR)"
atualizar "WAR-OUT-15" "EMG-WAR-PWR"
atualizar "WAR-EEC-18" "EMG-WAR-PWR"
atualizar "WAR-IDL-16" "EMG-WAR-PWR"
atualizar "WAR-OIL-18" "EMG-WAR-PWR"

# 7. EMG CAUTION POWERPLANT
echo ""
echo "7️⃣  EMERGÊNCIA CAUTION POWERPLANT (EMG-CAU-PWR)"
atualizar "CAU-HOT-65" "EMG-CAU-PWR"
atualizar "CAU-CST-59" "EMG-CAU-PWR"
atualizar "CAU-OVS-64" "EMG-CAU-PWR"
atualizar "CAU-NGO-63" "EMG-CAU-PWR"
atualizar "CAU-CND-61" "EMG-CAU-PWR"
atualizar "CAU-TNF-62" "EMG-CAU-PWR"
atualizar "CAU-LIC-60" "EMG-CAU-PWR"

# 8. EMG CAUTION COMBUSTÍVEL
echo ""
echo "8️⃣  EMERGÊNCIA CAUTION COMBUSTÍVEL (EMG-CAU-FUEL)"
atualizar "CAU-FLO-73" "EMG-CAU-FUEL"
atualizar "CAU-2FP-74" "EMG-CAU-FUEL"
atualizar "CAU-EFP-75" "EMG-CAU-FUEL"

# 9. EMG WARNING ROTOR
echo ""
echo "9️⃣  EMERGÊNCIA WARNING ROTOR SYSTEM (EMG-WAR-ROTR)"
atualizar "WAR-LOW-29" "EMG-WAR-ROTR"
atualizar "WAR-HIG-29" "EMG-WAR-ROTR"

# 10. EMG WARNING TRANSMISSÃO
echo ""
echo "🔟 EMERGÊNCIA WARNING TRANSMISSÃO (EMG-WAR-TRAN)"
atualizar "WAR-MGB-30" "EMG-WAR-TRAN"
atualizar "WAR-TMP-30" "EMG-WAR-TRAN"
atualizar "WAR-TDR-X1" "EMG-WAR-TRAN"
atualizar "WAR-TCS-X1" "EMG-WAR-TRAN"
atualizar "WAR-MRC-X1" "EMG-WAR-TRAN"
atualizar "WAR-TRC-X1" "EMG-WAR-TRAN"

# 11. EMG CAUTION TRANSMISSÃO
echo ""
echo "1️⃣1️⃣  EMERGÊNCIA CAUTION TRANSMISSÃO (EMG-CAU-TRAN)"
atualizar "CAU-MGP-105" "EMG-CAU-TRAN"

# 12. EMG CAUTION HIDRÁULICO
echo ""
echo "1️⃣2️⃣  EMERGÊNCIA CAUTION HIDRÁULICO (EMG-CAU-HYD)"
atualizar "CAU-HYP-77" "EMG-CAU-HYD"
atualizar "CAU-SRV-80" "EMG-CAU-HYD"

# 13. EMG WARNING ELÉTRICO
echo ""
echo "1️⃣3️⃣  EMERGÊNCIA WARNING ELÉTRICO (EMG-WAR-ELEC)"
atualizar "WAR-GEN-11" "EMG-WAR-ELEC"
atualizar "WAR-BAT-14" "EMG-WAR-ELEC"
atualizar "WAR-AUX-14" "EMG-WAR-ELEC"

# 14. EMG CAUTION ELÉTRICO
echo ""
echo "1️⃣4️⃣  EMERGÊNCIA CAUTION ELÉTRICO (EMG-CAU-ELEC)"
atualizar "CAU-DCG-53" "EMG-CAU-ELEC"
atualizar "CAU-BOF-55" "EMG-CAU-ELEC"
atualizar "CAU-DCB-56" "EMG-CAU-ELEC"
atualizar "CAU-ACB-57" "EMG-CAU-ELEC"
atualizar "CAU-28D-58" "EMG-CAU-ELEC"

# 15. EMG CAUTION AFCS
echo ""
echo "1️⃣5️⃣  EMERGÊNCIA CAUTION AFCS AUTOPILOT (EMG-CAU-AFCS)"
atualizar "CAU-APO-38" "EMG-CAU-AFCS"
atualizar "CAU-APF-37" "EMG-CAU-AFCS"
atualizar "CAU-MIS-40" "EMG-CAU-AFCS"
atualizar "CAU-SAS-41" "EMG-CAU-AFCS"
atualizar "CAU-AFD-41" "EMG-CAU-AFCS"

# 16. EMG CAUTION AVIÔNICOS
echo ""
echo "1️⃣6️⃣  EMERGÊNCIA CAUTION AVIÔNICOS (EMG-CAU-AVIO)"
atualizar "CAU-ADS-46" "EMG-CAU-AVIO"
atualizar "CAU-AHR-47" "EMG-CAU-AVIO"
atualizar "CAU-DUD-46" "EMG-CAU-AVIO"
atualizar "CAU-PFD-45" "EMG-CAU-AVIO"
atualizar "CAU-MFD-45" "EMG-CAU-AVIO"
atualizar "CAU-EIC-45" "EMG-CAU-AVIO"
atualizar "CAU-ADC-48" "EMG-CAU-AVIO"
atualizar "CAU-GPS-52" "EMG-CAU-AVIO"
atualizar "CAU-FMS-51" "EMG-CAU-AVIO"

# 17. EMG WARNING AVIÔNICOS
echo ""
echo "1️⃣7️⃣  EMERGÊNCIA WARNING AVIÔNICOS (EMG-WAR-AVIO)"
atualizar "WAR-STA-X1" "EMG-WAR-AVIO"

# 18. EMG WARNING FOGO
echo ""
echo "1️⃣8️⃣  EMERGÊNCIA WARNING FOGO FUMAÇA (EMG-WAR-FIRE)"
atualizar "WAR-FIR-21" "EMG-WAR-FIRE"
atualizar "WAR-CAB-23" "EMG-WAR-FIRE"
atualizar "WAR-BAG-23" "EMG-WAR-FIRE"

# 19. EMG WARNING DIVERSOS
echo ""
echo "1️⃣9️⃣  EMERGÊNCIA WARNING SISTEMAS DIVERSOS (EMG-WAR-MISC)"
atualizar "WAR-GER-27" "EMG-WAR-MISC"

# 20. EMG CAUTION DIVERSOS
echo ""
echo "2️⃣0️⃣  EMERGÊNCIA CAUTION SISTEMAS DIVERSOS (EMG-CAU-MISC)"
atualizar "CAU-O2P-82" "EMG-CAU-MISC"

echo ""
echo "════════════════════════════════════════"
echo "✅ CLASSIFICAÇÃO CONCLUÍDA!"
echo ""
echo "📊 RESUMO:"
echo "  - Total processado: $TOTAL manobras"
echo "  - Sucesso: $SUCESSO manobras"
echo "  - 20 categorias definidas"
echo ""
