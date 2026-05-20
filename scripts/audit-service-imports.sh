#!/bin/bash
set -euo pipefail

# Script de Auditoria - Imports de Services
# Identifica qual service está sendo usado onde

echo "🔍 Auditando imports de services de simuladores..."
echo ""

REPORT_FILE="_reports/service-imports-$(date +%Y%m%d_%H%M%S).txt"
mkdir -p _reports

echo "RELATÓRIO DE IMPORTS - SIMULADORES SERVICE" > "$REPORT_FILE"
echo "Data: $(date)" >> "$REPORT_FILE"
echo "========================================" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 1. Analisar imports do service principal
echo "1️⃣  Imports de: src/services/simuladores.service.ts" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

COUNT1=$(grep -r "from.*services/simuladores.service" src/ \
  --include="*.tsx" \
  --include="*.ts" \
  --exclude-dir=node_modules 2>/dev/null | wc -l | tr -d ' ')

echo "   Encontrados: $COUNT1 imports" | tee -a "$REPORT_FILE"
grep -r "from.*services/simuladores.service" src/ \
  --include="*.tsx" \
  --include="*.ts" \
  --exclude-dir=node_modules 2>/dev/null | \
  sed 's/^/   /' | tee -a "$REPORT_FILE"

echo "" | tee -a "$REPORT_FILE"

# 2. Analisar imports do service do react-app
echo "2️⃣  Imports de: src/react-app/services/simuladores.service.ts" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

COUNT2=$(grep -r "from.*react-app/services/simuladores.service\|from.*'@/services/simuladores.service" src/ \
  --include="*.tsx" \
  --include="*.ts" \
  --exclude-dir=node_modules 2>/dev/null | wc -l | tr -d ' ')

echo "   Encontrados: $COUNT2 imports" | tee -a "$REPORT_FILE"
grep -r "from.*react-app/services/simuladores.service\|from.*'@/services/simuladores.service" src/ \
  --include="*.tsx" \
  --include="*.ts" \
  --exclude-dir=node_modules 2>/dev/null | \
  sed 's/^/   /' | tee -a "$REPORT_FILE"

echo "" | tee -a "$REPORT_FILE"

# 3. Resumo
echo "========================================" | tee -a "$REPORT_FILE"
echo "📊 RESUMO:" | tee -a "$REPORT_FILE"
echo "   src/services/simuladores.service.ts: $COUNT1 usos" | tee -a "$REPORT_FILE"
echo "   src/react-app/services/simuladores.service.ts: $COUNT2 usos" | tee -a "$REPORT_FILE"
echo "" | tee -a "$REPORT_FILE"

if [ "$COUNT1" -gt 0 ] && [ "$COUNT2" -gt 0 ]; then
  echo "⚠️  AMBOS os services estão sendo usados!" | tee -a "$REPORT_FILE"
  echo "   Recomendação: Consolidar em um único service." | tee -a "$REPORT_FILE"
elif [ "$COUNT1" -gt 0 ]; then
  echo "✅ Apenas src/services/simuladores.service.ts está em uso." | tee -a "$REPORT_FILE"
  echo "   Pode remover: src/react-app/services/simuladores.service.ts" | tee -a "$REPORT_FILE"
elif [ "$COUNT2" -gt 0 ]; then
  echo "✅ Apenas src/react-app/services/simuladores.service.ts está em uso." | tee -a "$REPORT_FILE"
  echo "   Pode remover: src/services/simuladores.service.ts" | tee -a "$REPORT_FILE"
else
  echo "❓ Nenhum import direto encontrado." | tee -a "$REPORT_FILE"
  echo "   Verificar imports via barrel exports (index.ts)" | tee -a "$REPORT_FILE"
fi

echo "" | tee -a "$REPORT_FILE"
echo "📝 Relatório completo salvo em: $REPORT_FILE"
