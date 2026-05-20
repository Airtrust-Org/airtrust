#!/bin/bash

API="https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev"

echo "🎨 CRIANDO 20 CATEGORIAS DE MANOBRAS COM CORES"
echo "════════════════════════════════════════════════"
echo ""

criar_categoria() {
  local codigo=$1
  local nome=$2
  local cor=$3
  
  RESP=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d "{\"codigo\":\"$codigo\",\"nome\":\"$nome\",\"cor\":\"$cor\",\"ativo\":1}" \
    "$API/api/v2/categorias-manobras")
  
  if echo "$RESP" | grep -q "success"; then
    echo "  ✅ $nome"
  else
    echo "  ℹ️  $nome (já existe)"
  fi
}

# 1. CONTROLE BÁSICO
criar_categoria "FLY-BAS" "Controle Básico" "#3B82F6"

# 2. OPERAÇÕES NORMAIS
criar_categoria "OPS-NRM" "Operações Normais" "#10B981"

# 3. NAVEGAÇÃO
criar_categoria "OPS-NAV" "Navegação" "#8B5CF6"

# 4. APROXIMAÇÕES
criar_categoria "OPS-APP" "Aproximações" "#EC4899"

# 5. OPERAÇÕES ESPECIAIS
criar_categoria "OPS-ESP" "Operações Especiais" "#F59E0B"

# 6. EMG WARNING POWERPLANT
criar_categoria "EMG-WAR-PWR" "Emergência WARNING: Powerplant" "#DC2626"

# 7. EMG CAUTION POWERPLANT
criar_categoria "EMG-CAU-PWR" "Emergência CAUTION: Powerplant" "#F97316"

# 8. EMG CAUTION COMBUSTÍVEL
criar_categoria "EMG-CAU-FUEL" "Emergência CAUTION: Combustível" "#FBBF24"

# 9. EMG WARNING ROTOR
criar_categoria "EMG-WAR-ROTR" "Emergência WARNING: Rotor System" "#DC2626"

# 10. EMG WARNING TRANSMISSÃO
criar_categoria "EMG-WAR-TRAN" "Emergência WARNING: Transmissão" "#991B1B"

# 11. EMG CAUTION TRANSMISSÃO
criar_categoria "EMG-CAU-TRAN" "Emergência CAUTION: Transmissão" "#0EA5E9"

# 12. EMG CAUTION HIDRÁULICO
criar_categoria "EMG-CAU-HYD" "Emergência CAUTION: Hidráulico" "#06B6D4"

# 13. EMG WARNING ELÉTRICO
criar_categoria "EMG-WAR-ELEC" "Emergência WARNING: Elétrico" "#EAB308"

# 14. EMG CAUTION ELÉTRICO
criar_categoria "EMG-CAU-ELEC" "Emergência CAUTION: Elétrico" "#6366F1"

# 15. EMG CAUTION AFCS
criar_categoria "EMG-CAU-AFCS" "Emergência CAUTION: AFCS/Autopilot" "#14B8A6"

# 16. EMG CAUTION AVIÔNICOS
criar_categoria "EMG-CAU-AVIO" "Emergência CAUTION: Aviônicos" "#8B5CF6"

# 17. EMG WARNING AVIÔNICOS
criar_categoria "EMG-WAR-AVIO" "Emergência WARNING: Aviônicos" "#DC2626"

# 18. EMG WARNING FOGO
criar_categoria "EMG-WAR-FIRE" "Emergência WARNING: Fogo & Fumaça" "#B91C1C"

# 19. EMG WARNING DIVERSOS
criar_categoria "EMG-WAR-MISC" "Emergência WARNING: Diversos" "#64748B"

# 20. EMG CAUTION DIVERSOS
criar_categoria "EMG-CAU-MISC" "Emergência CAUTION: Diversos" "#475569"

echo ""
echo "✅ 20 CATEGORIAS CRIADAS!"
echo ""
