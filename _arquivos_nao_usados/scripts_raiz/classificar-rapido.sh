#!/bin/bash
API="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"
echo "🎨 CLASSIFICANDO MANOBRAS..."
MANOBRAS=$(curl -s "$API/api/v2/manobras")

atualizar() {
  ID=$(echo "$MANOBRAS" | jq -r ".data[] | select(.codigo == \"$1\") | .id")
  NOME=$(echo "$MANOBRAS" | jq -r ".data[] | select(.codigo == \"$1\") | .nome")
  [ -z "$ID" ] && return
  curl -s -X PUT -H "Content-Type: application/json" \
    -d "{\"codigo\":\"$1\",\"nome\":\"$NOME\",\"categoria\":\"$2\",\"tipo\":\"NORMAL\",\"ativo\":1}" \
    "$API/api/v2/manobras/$ID" > /dev/null && echo "✅ $1 → $2"
}

# FLY-BAS
atualizar "FLY-BAS-X1" "FLY-BAS"
atualizar "FLY-BAS-X2" "FLY-BAS"
atualizar "FLY-BAS-X3" "FLY-BAS"
atualizar "FLY-BAS-X4" "FLY-BAS"
atualizar "FLY-BAS-17" "FLY-BAS"

# OPS-NRM
atualizar "OPS-NRM-X1" "OPS-NRM"
atualizar "OPS-NRM-X2" "OPS-NRM"
atualizar "OPS-NRM-X3" "OPS-NRM"

# OPS-NAV
atualizar "OPS-NAV-X1" "OPS-NAV"
atualizar "OPS-NAV-X2" "OPS-NAV"
atualizar "OPS-NAV-X3" "OPS-NAV"
atualizar "OPS-NAV-X4" "OPS-NAV"

# OPS-APP
atualizar "OPS-APP-X1" "OPS-APP"
atualizar "OPS-APP-X2" "OPS-APP"
atualizar "OPS-APP-X3" "OPS-APP"
atualizar "OPS-APP-X4" "OPS-APP"

# OPS-ESP
atualizar "OPS-OFF-X1" "OPS-ESP"
atualizar "OPS-OFF-X2" "OPS-ESP"
atualizar "OPS-LOFT-X1" "OPS-ESP"

# EMG-WAR-PWR
atualizar "WAR-OUT-15" "EMG-WAR-PWR"
atualizar "WAR-EEC-18" "EMG-WAR-PWR"
atualizar "WAR-IDL-16" "EMG-WAR-PWR"
atualizar "WAR-OIL-18" "EMG-WAR-PWR"

# EMG-CAU-PWR
atualizar "CAU-HOT-65" "EMG-CAU-PWR"
atualizar "CAU-CST-59" "EMG-CAU-PWR"
atualizar "CAU-OVS-64" "EMG-CAU-PWR"
atualizar "CAU-NGO-63" "EMG-CAU-PWR"
atualizar "CAU-CND-61" "EMG-CAU-PWR"
atualizar "CAU-TNF-62" "EMG-CAU-PWR"
atualizar "CAU-LIC-60" "EMG-CAU-PWR"

# EMG-CAU-FUEL
atualizar "CAU-FLO-73" "EMG-CAU-FUEL"
atualizar "CAU-2FP-74" "EMG-CAU-FUEL"
atualizar "CAU-EFP-75" "EMG-CAU-FUEL"

# EMG-WAR-ROTR
atualizar "WAR-LOW-29" "EMG-WAR-ROTR"
atualizar "WAR-HIG-29" "EMG-WAR-ROTR"

# EMG-WAR-TRAN
atualizar "WAR-MGB-30" "EMG-WAR-TRAN"
atualizar "WAR-TMP-30" "EMG-WAR-TRAN"
atualizar "WAR-TDR-X1" "EMG-WAR-TRAN"
atualizar "WAR-TCS-X1" "EMG-WAR-TRAN"
atualizar "WAR-MRC-X1" "EMG-WAR-TRAN"
atualizar "WAR-TRC-X1" "EMG-WAR-TRAN"

# EMG-CAU-TRAN
atualizar "CAU-MGP-105" "EMG-CAU-TRAN"

# EMG-CAU-HYD
atualizar "CAU-HYP-77" "EMG-CAU-HYD"
atualizar "CAU-SRV-80" "EMG-CAU-HYD"

# EMG-WAR-ELEC
atualizar "WAR-GEN-11" "EMG-WAR-ELEC"
atualizar "WAR-BAT-14" "EMG-WAR-ELEC"
atualizar "WAR-AUX-14" "EMG-WAR-ELEC"

# EMG-CAU-ELEC
atualizar "CAU-DCG-53" "EMG-CAU-ELEC"
atualizar "CAU-BOF-55" "EMG-CAU-ELEC"
atualizar "CAU-DCB-56" "EMG-CAU-ELEC"
atualizar "CAU-ACB-57" "EMG-CAU-ELEC"
atualizar "CAU-28D-58" "EMG-CAU-ELEC"

# EMG-CAU-AFCS
atualizar "CAU-APO-38" "EMG-CAU-AFCS"
atualizar "CAU-APF-37" "EMG-CAU-AFCS"
atualizar "CAU-MIS-40" "EMG-CAU-AFCS"
atualizar "CAU-SAS-41" "EMG-CAU-AFCS"
atualizar "CAU-AFD-41" "EMG-CAU-AFCS"

# EMG-CAU-AVIO
atualizar "CAU-ADS-46" "EMG-CAU-AVIO"
atualizar "CAU-AHR-47" "EMG-CAU-AVIO"
atualizar "CAU-DUD-46" "EMG-CAU-AVIO"
atualizar "CAU-PFD-45" "EMG-CAU-AVIO"
atualizar "CAU-MFD-45" "EMG-CAU-AVIO"
atualizar "CAU-EIC-45" "EMG-CAU-AVIO"
atualizar "CAU-ADC-48" "EMG-CAU-AVIO"
atualizar "CAU-GPS-52" "EMG-CAU-AVIO"
atualizar "CAU-FMS-51" "EMG-CAU-AVIO"

# EMG-WAR-AVIO
atualizar "WAR-STA-X1" "EMG-WAR-AVIO"

# EMG-WAR-FIRE
atualizar "WAR-FIR-21" "EMG-WAR-FIRE"
atualizar "WAR-CAB-23" "EMG-WAR-FIRE"
atualizar "WAR-BAG-23" "EMG-WAR-FIRE"

# EMG-WAR-MISC
atualizar "WAR-GER-27" "EMG-WAR-MISC"

# EMG-CAU-MISC
atualizar "CAU-O2P-82" "EMG-CAU-MISC"

echo ""
echo "✅ CONCLUÍDO! 72 manobras classificadas em 20 categorias"
