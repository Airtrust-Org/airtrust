#!/bin/bash
# compare-pdf-generators.sh
# Compara as 3 versões de PDF Generator para decidir qual manter

set -euo pipefail

echo "🔍 COMPARANDO PDF GENERATORS..."
echo ""

BASE="src/react-app/components/simuladores"
PDFs=(
  "PDFGeneratorDefinitivo.tsx"
  "PDFGeneratorNativo.tsx"
  "PDFGeneratorRobusto.tsx"
)

echo "=== MÉTRICAS DE CÓDIGO ==="
for pdf in "${PDFs[@]}"; do
  file="$BASE/$pdf"
  if [ -f "$file" ]; then
    lines=$(wc -l < "$file" | tr -d ' ')
    imports=$(grep "^import" "$file" | wc -l | tr -d ' ')
    exports=$(grep "^export" "$file" | wc -l | tr -d ' ')
    functions=$(grep -E "^(export )?function|^(export )?const.*=.*\(" "$file" | wc -l | tr -d ' ')
    
    echo ""
    echo "📄 $pdf"
    echo "   Linhas: $lines"
    echo "   Imports: $imports"
    echo "   Exports: $exports"
    echo "   Funções: $functions"
  else
    echo ""
    echo "📄 $pdf"
    echo "   ❌ Arquivo não encontrado"
  fi
done

echo ""
echo "=== USO NO CÓDIGO ==="
for pdf in "${PDFs[@]}"; do
  name="${pdf%.tsx}"
  uses=$(grep -r "import.*$name" src/react-app --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
  
  echo ""
  echo "📦 $pdf"
  echo "   Usado em: $uses arquivo(s)"
  
  if [ "$uses" -gt 0 ]; then
    echo "   Arquivos:"
    grep -r "import.*$name" src/react-app --include="*.tsx" --include="*.ts" 2>/dev/null | \
      cut -d: -f1 | sort -u | sed 's/^/      - /'
  fi
done

echo ""
echo "=== DEPENDÊNCIAS EXTERNAS ==="
for pdf in "${PDFs[@]}"; do
  file="$BASE/$pdf"
  if [ -f "$file" ]; then
    echo ""
    echo "📄 $pdf"
    
    # Verificar bibliotecas específicas de PDF
    if grep -q "jsPDF" "$file"; then
      echo "   ✅ Usa jsPDF"
    fi
    if grep -q "html2canvas" "$file"; then
      echo "   ✅ Usa html2canvas"
    fi
    if grep -q "react-pdf" "$file"; then
      echo "   ✅ Usa react-pdf"
    fi
    if grep -q "@react-pdf/renderer" "$file"; then
      echo "   ✅ Usa @react-pdf/renderer"
    fi
    
    # Listar todas as importações externas
    external_imports=$(grep "^import.*from ['\"]" "$file" | \
      grep -v "from ['\"][@./]" | \
      sed "s/.*from ['\"]//; s/['\"].*//" | \
      sort -u)
    
    if [ -n "$external_imports" ]; then
      echo "   Bibliotecas:"
      echo "$external_imports" | sed 's/^/      - /'
    fi
  fi
done

echo ""
echo "=== COMPLEXIDADE ==="
for pdf in "${PDFs[@]}"; do
  file="$BASE/$pdf"
  if [ -f "$file" ]; then
    # Calcular complexidade ciclomática aproximada (conta ifs, fors, etc)
    complexity=$(grep -E "if |for |while |switch |catch |\? " "$file" | wc -l | tr -d ' ')
    
    echo ""
    echo "📄 $pdf"
    echo "   Complexidade: $complexity pontos de decisão"
    
    # Análise de qualidade
    if [ "$complexity" -lt 20 ]; then
      echo "   🟢 Baixa complexidade (bom)"
    elif [ "$complexity" -lt 50 ]; then
      echo "   🟡 Média complexidade"
    else
      echo "   🔴 Alta complexidade (risco)"
    fi
  fi
done

echo ""
echo "=== RECOMENDAÇÃO ==="
echo ""

# Contar usos de cada versão
def_uses=$(grep -r "import.*PDFGeneratorDefinitivo" src/react-app 2>/dev/null | wc -l | tr -d ' ')
nat_uses=$(grep -r "import.*PDFGeneratorNativo" src/react-app 2>/dev/null | wc -l | tr -d ' ')
rob_uses=$(grep -r "import.*PDFGeneratorRobusto" src/react-app 2>/dev/null | wc -l | tr -d ' ')

echo "📊 Uso atual:"
echo "   PDFGeneratorDefinitivo: $def_uses uso(s)"
echo "   PDFGeneratorNativo: $nat_uses uso(s) ⭐"
echo "   PDFGeneratorRobusto: $rob_uses uso(s)"
echo ""

if [ "$nat_uses" -ge "$def_uses" ] && [ "$nat_uses" -ge "$rob_uses" ]; then
  echo "💡 RECOMENDAÇÃO: Manter PDFGeneratorNativo"
  echo "   Razão: É a versão mais usada atualmente"
elif [ "$rob_uses" -gt "$nat_uses" ] && [ "$rob_uses" -gt "$def_uses" ]; then
  echo "💡 RECOMENDAÇÃO: Manter PDFGeneratorRobusto"
  echo "   Razão: É a versão mais usada atualmente"
else
  echo "💡 RECOMENDAÇÃO: Testar as 3 versões manualmente"
  echo "   Razão: Uso equilibrado, decisão por qualidade necessária"
fi

echo ""
echo "📝 PRÓXIMOS PASSOS:"
echo "   1. Testar cada versão gerando um PDF real"
echo "   2. Avaliar qualidade do PDF (formatação, layout, performance)"
echo "   3. Escolher a melhor versão"
echo "   4. Executar ./scripts/consolidate-pdf-generator.sh <versao-escolhida>"
echo ""
echo "Exemplos:"
echo "   ./scripts/consolidate-pdf-generator.sh PDFGeneratorNativo.tsx"
echo "   ./scripts/consolidate-pdf-generator.sh PDFGeneratorRobusto.tsx"
