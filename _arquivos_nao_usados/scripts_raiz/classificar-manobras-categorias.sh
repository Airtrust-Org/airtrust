#!/bin/bash

API_URL="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🎨 CLASSIFICANDO MANOBRAS POR CATEGORIA"
echo "════════════════════════════════════════════════════════"
echo ""

# Buscar todas as manobras
MANOBRAS=$(curl -s "$API_URL/api/v2/manobras")

# Função para atualizar categoria de uma manobra
atualizar_categoria() {
  local codigo_manobra=$1
  local categoria=$2
  
  # Buscar ID da manobra
  MANOBRA_ID=$(echo "$MANOBRAS" | jq -r ".data[] | select(.codigo == \"$codigo_manobra\") | .id")
  
  if [ -z "$MANOBRA_ID" ] || [ "$MANOBRA_ID" == "null" ]; then
    echo "  ⚠️  $codigo_manobra não encontrada"
    return
  fi
  
  # Atualizar manobra
  RESP=$(curl -s -X PATCH \
    -H "Content-Type: application/json" \
    -d "{\"categoria\":\"$categoria\"}" \
    "$API_URL/api/v2/manobras/$MANOBRA_ID")
  
  if [ "$(echo "$RESP" | jq -r '.success')" == "true" ]; then
    echo "  ✅ $codigo_manobra"
  else
    echo "  ❌ $codigo_manobra: $(echo "$RESP" | jq -r '.error')"
  fi
}

# 1. CONTROLE BÁSICO
echo "1️⃣  CONTROLE BÁSICO"
atualizar_categoria "FLY-BAS-X1" "CONTROLE BÁSICO"
atualizar_categoria "FLY-BAS-X2" "CONTROLE BÁSICO"
atualizar_categoria "FLY-BAS-X3" "CONTROLE BÁSICO"
atualizar_categoria "FLY-BAS-X4" "CONTROLE BÁSICO"
atualizar_categoria "FLY-BAS-17" "CONTROLE BÁSICO"

# 2. OPERAÇÕES NORMAIS
echo ""
echo "2️⃣  OPERAÇÕES NORMAIS"
atualizar_categoria "OPS-NRM-X1" "OPERAÇÕES NORMAIS"
atualizar_categoria "OPS-NRM-X2" "OPERAÇÕES NORMAIS"
atualizar_categoria "OPS-NRM-X3" "OPERAÇÕES NORMAIS"

# 3. NAVEGAÇÃO
echo ""
echo "3️⃣  NAVEGAÇÃO"
atualizar_categoria "OPS-NAV-X1" "NAVEGAÇÃO"
atualizar_categoria "OPS-NAV-X2" "NAVEGAÇÃO"
atualizar_categoria "OPS-NAV-X3" "NAVEGAÇÃO"
atualizar_categoria "OPS-NAV-X4" "NAVEGAÇÃO"

# 4. APROXIMAÇÕES
echo ""
echo "4️⃣  APROXIMAÇÕES"
atualizar_categoria "OPS-APP-X1" "APROXIMAÇÕES"
atualizar_categoria "OPS-APP-X2" "APROXIMAÇÕES"
atualizar_categoria "OPS-APP-X3" "APROXIMAÇÕES"
atualizar_categoria "OPS-APP-X4" "APROXIMAÇÕES"

# 5. OPERAÇÕES ESPECIAIS
echo ""
echo "5️⃣  OPERAÇÕES ESPECIAIS"
atualizar_categoria "OPS-OFF-X1" "OPERAÇÕES ESPECIAIS"
atualizar_categoria "OPS-OFF-X2" "OPERAÇÕES ESPECIAIS"
atualizar_categoria "OPS-LOFT-X1" "OPERAÇÕES ESPECIAIS"

# 6. WARNING: POWERPLANT
echo ""
echo "6️⃣  EMERGÊNCIA - WARNING: POWERPLANT"
atualizar_categoria "WAR-OUT-15" "EMERGÊNCIA - WARNING: POWERPLANT"
atualizar_categoria "WAR-EEC-18" "EMERGÊNCIA - WARNING: POWERPLANT"
atualizar_categoria "WAR-IDL-16" "EMERGÊNCIA - WARNING: POWERPLANT"
atualizar_categoria "WAR-OIL-18" "EMERGÊNCIA - WARNING: POWERPLANT"

# 7. CAUTION: POWERPLANT
echo ""
echo "7️⃣  EMERGÊNCIA - CAUTION: POWERPLANT"
atualizar_categoria "CAU-HOT-65" "EMERGÊNCIA - CAUTION: POWERPLANT"
atualizar_categoria "CAU-CST-59" "EMERGÊNCIA - CAUTION: POWERPLANT"
atualizar_categoria "CAU-OVS-64" "EMERGÊNCIA - CAUTION: POWERPLANT"
atualizar_categoria "CAU-NGO-63" "EMERGÊNCIA - CAUTION: POWERPLANT"
atualizar_categoria "CAU-CND-61" "EMERGÊNCIA - CAUTION: POWERPLANT"
atualizar_categoria "CAU-TNF-62" "EMERGÊNCIA - CAUTION: POWERPLANT"
atualizar_categoria "CAU-LIC-60" "EMERGÊNCIA - CAUTION: POWERPLANT"

# 8. CAUTION: COMBUSTÍVEL
echo ""
echo "8️⃣  EMERGÊNCIA - CAUTION: COMBUSTÍVEL"
atualizar_categoria "CAU-FLO-73" "EMERGÊNCIA - CAUTION: COMBUSTÍVEL"
atualizar_categoria "CAU-2FP-74" "EMERGÊNCIA - CAUTION: COMBUSTÍVEL"
atualizar_categoria "CAU-EFP-75" "EMERGÊNCIA - CAUTION: COMBUSTÍVEL"

# 9. WARNING: ROTOR SYSTEM
echo ""
echo "9️⃣  EMERGÊNCIA - WARNING: ROTOR SYSTEM"
atualizar_categoria "WAR-LOW-29" "EMERGÊNCIA - WARNING: ROTOR SYSTEM"
atualizar_categoria "WAR-HIG-29" "EMERGÊNCIA - WARNING: ROTOR SYSTEM"

# 10. WARNING: TRANSMISSÃO & ROTOR
echo ""
echo "🔟 EMERGÊNCIA - WARNING: TRANSMISSÃO & ROTOR"
atualizar_categoria "WAR-MGB-30" "EMERGÊNCIA - WARNING: TRANSMISSÃO & ROTOR"
atualizar_categoria "WAR-TMP-30" "EMERGÊNCIA - WARNING: TRANSMISSÃO & ROTOR"
atualizar_categoria "CAU-MGP-105" "EMERGÊNCIA - WARNING: TRANSMISSÃO & ROTOR"
atualizar_categoria "WAR-TDR-X1" "EMERGÊNCIA - WARNING: TRANSMISSÃO & ROTOR"
atualizar_categoria "WAR-TCS-X1" "EMERGÊNCIA - WARNING: TRANSMISSÃO & ROTOR"
atualizar_categoria "WAR-MRC-X1" "EMERGÊNCIA - WARNING: TRANSMISSÃO & ROTOR"
atualizar_categoria "WAR-TRC-X1" "EMERGÊNCIA - WARNING: TRANSMISSÃO & ROTOR"

# 11. CAUTION: HIDRÁULICO
echo ""
echo "1️⃣1️⃣  EMERGÊNCIA - CAUTION: HIDRÁULICO"
atualizar_categoria "CAU-HYP-77" "EMERGÊNCIA - CAUTION: HIDRÁULICO"
atualizar_categoria "CAU-SRV-80" "EMERGÊNCIA - CAUTION: HIDRÁULICO"

# 12. WARNING/CAUTION: ELÉTRICO
echo ""
echo "1️⃣2️⃣  EMERGÊNCIA - WARNING/CAUTION: ELÉTRICO"
atualizar_categoria "WAR-GEN-11" "EMERGÊNCIA - WARNING/CAUTION: ELÉTRICO"
atualizar_categoria "WAR-BAT-14" "EMERGÊNCIA - WARNING/CAUTION: ELÉTRICO"
atualizar_categoria "WAR-AUX-14" "EMERGÊNCIA - WARNING/CAUTION: ELÉTRICO"
atualizar_categoria "CAU-DCG-53" "EMERGÊNCIA - WARNING/CAUTION: ELÉTRICO"
atualizar_categoria "CAU-BOF-55" "EMERGÊNCIA - WARNING/CAUTION: ELÉTRICO"
atualizar_categoria "CAU-DCB-56" "EMERGÊNCIA - WARNING/CAUTION: ELÉTRICO"
atualizar_categoria "CAU-ACB-57" "EMERGÊNCIA - WARNING/CAUTION: ELÉTRICO"
atualizar_categoria "CAU-28D-58" "EMERGÊNCIA - WARNING/CAUTION: ELÉTRICO"

# 13. CAUTION: AFCS / AUTOPILOT
echo ""
echo "1️⃣3️⃣  EMERGÊNCIA - CAUTION: AFCS / AUTOPILOT"
atualizar_categoria "CAU-APO-38" "EMERGÊNCIA - CAUTION: AFCS / AUTOPILOT"
atualizar_categoria "CAU-APF-37" "EMERGÊNCIA - CAUTION: AFCS / AUTOPILOT"
atualizar_categoria "CAU-MIS-40" "EMERGÊNCIA - CAUTION: AFCS / AUTOPILOT"
atualizar_categoria "CAU-SAS-41" "EMERGÊNCIA - CAUTION: AFCS / AUTOPILOT"
atualizar_categoria "CAU-AFD-41" "EMERGÊNCIA - CAUTION: AFCS / AUTOPILOT"

# 14. CAUTION: AVIÔNICOS & DISPLAYS
echo ""
echo "1️⃣4️⃣  EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"
atualizar_categoria "CAU-ADS-46" "EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"
atualizar_categoria "CAU-AHR-47" "EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"
atualizar_categoria "CAU-DUD-46" "EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"
atualizar_categoria "CAU-PFD-45" "EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"
atualizar_categoria "CAU-MFD-45" "EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"
atualizar_categoria "CAU-EIC-45" "EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"
atualizar_categoria "CAU-ADC-48" "EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"
atualizar_categoria "CAU-GPS-52" "EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"
atualizar_categoria "CAU-FMS-51" "EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"
atualizar_categoria "WAR-STA-X1" "EMERGÊNCIA - CAUTION: AVIÔNICOS & DISPLAYS"

# 15. WARNING: FOGO & FUMAÇA
echo ""
echo "1️⃣5️⃣  EMERGÊNCIA - WARNING: FOGO & FUMAÇA"
atualizar_categoria "WAR-FIR-21" "EMERGÊNCIA - WARNING: FOGO & FUMAÇA"
atualizar_categoria "WAR-CAB-23" "EMERGÊNCIA - WARNING: FOGO & FUMAÇA"
atualizar_categoria "WAR-BAG-23" "EMERGÊNCIA - WARNING: FOGO & FUMAÇA"

# 16. WARNING/CAUTION: DIVERSOS
echo ""
echo "1️⃣6️⃣  EMERGÊNCIA - WARNING/CAUTION: DIVERSOS"
atualizar_categoria "WAR-GER-27" "EMERGÊNCIA - WARNING/CAUTION: DIVERSOS"
atualizar_categoria "CAU-O2P-82" "EMERGÊNCIA - WARNING/CAUTION: DIVERSOS"

# 17. CENÁRIOS INTEGRADOS
echo ""
echo "1️⃣7️⃣  CENÁRIOS INTEGRADOS"
atualizar_categoria "MULTI-FAIL-X1" "CENÁRIOS INTEGRADOS"
atualizar_categoria "CHECK-FINAL" "CENÁRIOS INTEGRADOS"

echo ""
echo "✅ CLASSIFICAÇÃO CONCLUÍDA!"
echo ""
echo "📊 RESUMO:"
echo "  - 17 categorias definidas"
echo "  - ~80 manobras classificadas"
echo ""
