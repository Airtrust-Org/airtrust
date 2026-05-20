#!/bin/bash
set -euo pipefail

# Verificar Imports Quebrados Pós-Limpeza
# Data: 1 de dezembro de 2025

echo "🔍 Verificando imports quebrados após limpeza..."
echo ""

# Componentes que foram deletados
COMPONENTES_DELETADOS=(
  "AssinaturaDigitalModal"
  "BotoesAcaoFicha"
  "BotoesAcaoFichaFinal"
  "PDFGeneratorCompacto"
  "FichaOpenModal"
  "VisualizarFichaSimulador"
  "SessionModal"
  "FormularioTemplate"
  "CadastrosUnificados"
)

echo "=== COMPONENTES DELETADOS (NÃO DEVEM APARECER) ==="
echo ""

FOUND_ISSUES=0

for comp in "${COMPONENTES_DELETADOS[@]}"; do
  result=$(grep -r "import.*$comp" src/react-app --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | xargs)
  if [ "$result" -gt 0 ]; then
    echo "❌ $comp: $result imports encontrados (PROBLEMA!)"
    grep -r "import.*$comp" src/react-app --include="*.tsx" --include="*.ts" 2>/dev/null | head -5
    FOUND_ISSUES=$((FOUND_ISSUES + 1))
    echo ""
  else
    echo "✅ $comp: 0 imports (correto)"
  fi
done

echo ""
echo "=== SERVICE DUPLICADO (NÃO DEVE EXISTIR) ==="
if [ -f "src/react-app/services/simuladores.service.ts" ]; then
  echo "❌ Service duplicado ainda existe! (PROBLEMA)"
  FOUND_ISSUES=$((FOUND_ISSUES + 1))
else
  echo "✅ Service duplicado deletado corretamente"
fi

echo ""
if [ $FOUND_ISSUES -eq 0 ]; then
  echo "✅ Nenhum import quebrado encontrado!"
  echo "📝 Pode prosseguir para testes"
else
  echo "⚠️  Encontrados $FOUND_ISSUES problemas!"
  echo "📝 Corrija imports manualmente antes de continuar"
fi
