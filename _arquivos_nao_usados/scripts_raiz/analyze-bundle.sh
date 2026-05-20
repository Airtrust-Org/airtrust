#!/bin/bash
# analyze-bundle.sh

set -euo pipefail

echo "📦 ANÁLISE DE BUNDLE - AIRTRUST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Build de produção
echo "🔨 Executando build de produção..."
npm run build

echo ""
echo "📊 ESTATÍSTICAS DO BUILD:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 2. Analisar tamanho do bundle
DIST_DIR="dist"

if [ -d "$DIST_DIR" ]; then
  echo ""
  echo "📁 Tamanhos de arquivos (maiores primeiro):"
  find $DIST_DIR -type f -exec du -h {} + | sort -rh | head -20
  
  echo ""
  echo "📊 Resumo por tipo:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📄 JavaScript:"
  find $DIST_DIR -name "*.js" -exec du -ch {} + 2>/dev/null | tail -1 || echo "0 KB"
  
  echo ""
  echo "🎨 CSS:"
  find $DIST_DIR -name "*.css" -exec du -ch {} + 2>/dev/null | tail -1 || echo "0 KB"
  
  echo ""
  echo "🖼️  Assets (imagens, fontes, etc):"
  find $DIST_DIR -type f ! -name "*.js" ! -name "*.css" ! -name "*.html" -exec du -ch {} + 2>/dev/null | tail -1 || echo "0 KB"
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📦 TOTAL DO BUNDLE:"
  du -sh $DIST_DIR
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  # 3. Gzip simulation
  echo ""
  echo "🗜️  TAMANHOS GZIP (simulado):"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  echo ""
  echo "📄 JS comprimido:"
  JS_SIZE=$(find $DIST_DIR -name "*.js" -exec cat {} \; 2>/dev/null | gzip -c | wc -c)
  JS_SIZE_KB=$(echo "scale=2; $JS_SIZE/1024" | bc)
  echo "   ${JS_SIZE_KB} KB"
  
  echo ""
  echo "🎨 CSS comprimido:"
  CSS_SIZE=$(find $DIST_DIR -name "*.css" -exec cat {} \; 2>/dev/null | gzip -c | wc -c)
  CSS_SIZE_KB=$(echo "scale=2; $CSS_SIZE/1024" | bc)
  echo "   ${CSS_SIZE_KB} KB"
  
  # 4. Identificar chunks grandes
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "⚠️  CHUNKS MAIORES QUE 500KB:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  LARGE_CHUNKS=$(find $DIST_DIR -name "*.js" -size +500k 2>/dev/null)
  
  if [ -z "$LARGE_CHUNKS" ]; then
    echo "✅ Nenhum chunk maior que 500KB encontrado!"
  else
    echo ""
    find $DIST_DIR -name "*.js" -size +500k -exec ls -lh {} \; | awk '{print "   " $9 " → " $5}'
  fi
  
  # 5. Top 10 arquivos JS
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 TOP 10 ARQUIVOS JS:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  find $DIST_DIR -name "*.js" -exec du -h {} + | sort -rh | head -10 | awk '{print "   " $2 " → " $1}'
  
  # 6. Análise de vendor chunks
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📦 VENDOR CHUNKS:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  VENDOR_CHUNKS=$(find $DIST_DIR -name "*vendor*.js" 2>/dev/null)
  
  if [ -z "$VENDOR_CHUNKS" ]; then
    echo "ℹ️  Nenhum vendor chunk separado encontrado"
  else
    find $DIST_DIR -name "*vendor*.js" -exec ls -lh {} \; | awk '{print "   " $9 " → " $5}'
  fi
  
  # 7. Contagem de arquivos
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📊 CONTAGEM DE ARQUIVOS:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "   JS:  $(find $DIST_DIR -name "*.js" | wc -l | tr -d ' ')"
  echo "   CSS: $(find $DIST_DIR -name "*.css" | wc -l | tr -d ' ')"
  echo "   HTML: $(find $DIST_DIR -name "*.html" | wc -l | tr -d ' ')"
  echo "   Outros: $(find $DIST_DIR -type f ! -name "*.js" ! -name "*.css" ! -name "*.html" | wc -l | tr -d ' ')"
  echo "   TOTAL: $(find $DIST_DIR -type f | wc -l | tr -d ' ')"
  
  # 8. Recomendações
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "💡 RECOMENDAÇÕES:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  # Check if bundle is too large
  TOTAL_SIZE=$(du -s $DIST_DIR | awk '{print $1}')
  
  if [ $TOTAL_SIZE -gt 2000 ]; then
    echo "⚠️  Bundle total > 2MB - Considere code splitting"
  else
    echo "✅ Bundle total está em tamanho aceitável"
  fi
  
  # Check for large JS files
  LARGE_JS=$(find $DIST_DIR -name "*.js" -size +300k 2>/dev/null | wc -l | tr -d ' ')
  if [ "$LARGE_JS" -gt 0 ]; then
    echo "⚠️  $LARGE_JS arquivo(s) JS > 300KB - Considere lazy loading"
  else
    echo "✅ Nenhum arquivo JS muito grande"
  fi
  
  # Check gzip ratio
  ORIGINAL_JS=$(find $DIST_DIR -name "*.js" -exec cat {} \; 2>/dev/null | wc -c)
  if [ $ORIGINAL_JS -gt 0 ]; then
    RATIO=$(echo "scale=2; $JS_SIZE * 100 / $ORIGINAL_JS" | bc)
    echo "ℹ️  Ratio compressão JS: ${RATIO}%"
    
    if (( $(echo "$RATIO > 35" | bc -l) )); then
      echo "⚠️  Ratio de compressão alto - Verifique se há código repetido"
    fi
  fi
  
else
  echo "❌ Diretório dist/ não encontrado!"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Análise completa!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Dica: Para análise visual interativa, instale:"
echo "   npm install -D rollup-plugin-visualizer"
echo ""
