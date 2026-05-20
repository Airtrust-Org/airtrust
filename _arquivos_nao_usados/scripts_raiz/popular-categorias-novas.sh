#!/bin/bash
API="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🗑️  DELETANDO CATEGORIAS ANTIGAS..."
for id in 1 2 3; do
  curl -s -X DELETE "$API/api/v2/simuladores-consolidado/categorias/$id" > /dev/null
  echo "  ✅ Deletada categoria $id"
done

echo ""
echo "🎨 CRIANDO 20 CATEGORIAS NOVAS..."
echo ""

criar() {
  curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"codigo\":\"$1\",\"nome\":\"$2\",\"cor\":\"$3\",\"ativo\":1}" \
    "$API/api/v2/simuladores-consolidado/categorias" > /dev/null
  echo "  ✅ $2"
}

criar "FLY-BAS" "Controle Básico" "#3B82F6"
criar "OPS-NRM" "Operações Normais" "#10B981"
criar "OPS-NAV" "Navegação" "#8B5CF6"
criar "OPS-APP" "Aproximações" "#EC4899"
criar "OPS-ESP" "Operações Especiais" "#F59E0B"
criar "EMG-WAR-PWR" "Emergência WARNING: Powerplant" "#DC2626"
criar "EMG-CAU-PWR" "Emergência CAUTION: Powerplant" "#F97316"
criar "EMG-CAU-FUEL" "Emergência CAUTION: Combustível" "#FBBF24"
criar "EMG-WAR-ROTR" "Emergência WARNING: Rotor System" "#DC2626"
criar "EMG-WAR-TRAN" "Emergência WARNING: Transmissão" "#991B1B"
criar "EMG-CAU-TRAN" "Emergência CAUTION: Transmissão" "#0EA5E9"
criar "EMG-CAU-HYD" "Emergência CAUTION: Hidráulico" "#06B6D4"
criar "EMG-WAR-ELEC" "Emergência WARNING: Elétrico" "#EAB308"
criar "EMG-CAU-ELEC" "Emergência CAUTION: Elétrico" "#6366F1"
criar "EMG-CAU-AFCS" "Emergência CAUTION: AFCS/Autopilot" "#14B8A6"
criar "EMG-CAU-AVIO" "Emergência CAUTION: Aviônicos" "#8B5CF6"
criar "EMG-WAR-AVIO" "Emergência WARNING: Aviônicos" "#DC2626"
criar "EMG-WAR-FIRE" "Emergência WARNING: Fogo & Fumaça" "#B91C1C"
criar "EMG-WAR-MISC" "Emergência WARNING: Diversos" "#64748B"
criar "EMG-CAU-MISC" "Emergência CAUTION: Diversos" "#475569"

echo ""
echo "✅ 20 CATEGORIAS CRIADAS!"
