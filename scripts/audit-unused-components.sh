#!/bin/bash
set -euo pipefail

# Script de Auditoria - Componentes Não Usados
# Identifica componentes que não estão sendo importados

MODULE=${1:-simuladores}
COMPONENT_DIR="src/react-app/components/$MODULE"
SEARCH_DIRS="src/react-app"

echo "🔍 Auditando componentes não usados em: $MODULE"
echo ""

if [ ! -d "$COMPONENT_DIR" ]; then
  echo "❌ Diretório não encontrado: $COMPONENT_DIR"
  exit 1
fi

echo "📁 Analisando componentes em: $COMPONENT_DIR"
echo ""

TOTAL=0
UNUSED=0
USED=0

# Criar arquivo temporário para resultados
REPORT_FILE="_reports/unused-components-$(date +%Y%m%d_%H%M%S).txt"
mkdir -p _reports

echo "RELATÓRIO DE COMPONENTES NÃO USADOS - $MODULE" > "$REPORT_FILE"
echo "Data: $(date)" >> "$REPORT_FILE"
echo "========================================" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Analisar cada arquivo .tsx
for file in "$COMPONENT_DIR"/*.tsx; do
  if [ -f "$file" ]; then
    TOTAL=$((TOTAL + 1))
    COMPONENT_NAME=$(basename "$file" .tsx)
    
    # Contar imports deste componente (excluindo o próprio arquivo)
    COUNT=$(grep -r "import.*$COMPONENT_NAME" "$SEARCH_DIRS" \
      --include="*.tsx" \
      --include="*.ts" \
      --exclude="$(basename "$file")" 2>/dev/null | wc -l | tr -d ' ')
    
    if [ "$COUNT" -eq "0" ]; then
      UNUSED=$((UNUSED + 1))
      echo "❌ NÃO USADO: $COMPONENT_NAME"
      echo "   Arquivo: $file"
      echo ""
      echo "❌ $COMPONENT_NAME (0 imports)" >> "$REPORT_FILE"
    else
      USED=$((USED + 1))
      echo "✅ USADO: $COMPONENT_NAME ($COUNT imports)"
    fi
  fi
done

echo "" >> "$REPORT_FILE"
echo "========================================" >> "$REPORT_FILE"
echo "RESUMO:" >> "$REPORT_FILE"
echo "  Total de componentes: $TOTAL" >> "$REPORT_FILE"
echo "  Em uso: $USED" >> "$REPORT_FILE"
echo "  Não usados: $UNUSED" >> "$REPORT_FILE"
echo "  Taxa de uso: $(( USED * 100 / TOTAL ))%" >> "$REPORT_FILE"

echo ""
echo "=========================================="
echo "📊 RESUMO:"
echo "   Total de componentes: $TOTAL"
echo "   Em uso: $USED"
echo "   Não usados: $UNUSED"
echo "   Taxa de uso: $(( USED * 100 / TOTAL ))%"
echo ""
echo "📝 Relatório completo salvo em: $REPORT_FILE"
echo ""

if [ $UNUSED -gt 0 ]; then
  echo "⚠️  Encontrados $UNUSED componentes não usados!"
  echo "   Considere removê-los após revisão manual."
else
  echo "✅ Todos os componentes estão em uso!"
fi
