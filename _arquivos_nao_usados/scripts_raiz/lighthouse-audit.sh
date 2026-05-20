#!/bin/bash
# lighthouse-audit.sh

set -euo pipefail

echo "🏠 LIGHTHOUSE AUDIT - AIRTRUST"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# URLs para testar
URLS=(
  "http://localhost:3000"
  "http://localhost:3000/funcionarios"
  "http://localhost:3000/qualificacoes"
  "http://localhost:3000/simuladores"
  "http://localhost:3000/compliance"
  "http://localhost:3000/auditoria"
)

# Verificar se lighthouse está instalado
if ! command -v lighthouse &> /dev/null; then
  echo "❌ Lighthouse não encontrado!"
  echo ""
  echo "📦 Instale com:"
  echo "   npm install -g lighthouse"
  echo ""
  echo "Ou execute via npx:"
  echo "   npx lighthouse <url>"
  exit 1
fi

# Verificar se jq está instalado (para parsear JSON)
if ! command -v jq &> /dev/null; then
  echo "⚠️  jq não encontrado - scores não serão extraídos"
  echo ""
  echo "📦 Instale com:"
  echo "   macOS: brew install jq"
  echo "   Linux: apt-get install jq"
  echo ""
  JQ_AVAILABLE=false
else
  JQ_AVAILABLE=true
fi

# Verificar se localhost:3000 está rodando
echo "🔍 Verificando se localhost:3000 está acessível..."
if ! curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "200\|302"; then
  echo "❌ localhost:3000 não está respondendo!"
  echo ""
  echo "📌 Certifique-se de que o dev server está rodando:"
  echo "   npm run dev:web"
  echo ""
  exit 1
fi
echo "✅ localhost:3000 está acessível!"
echo ""

# Criar diretório de reports
mkdir -p reports/lighthouse

echo "🚦 Testando ${#URLS[@]} páginas..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Array para armazenar scores
declare -a PERFORMANCE_SCORES
declare -a ACCESSIBILITY_SCORES
declare -a BEST_PRACTICES_SCORES
declare -a SEO_SCORES

for url in "${URLS[@]}"; do
  page_name=$(echo $url | sed 's|http://localhost:3000||' | sed 's|/|-|g' | sed 's|^-||')
  if [ -z "$page_name" ]; then
    page_name="home"
  fi
  
  echo "📄 Testando: $url"
  echo "   Nome: $page_name"
  
  # Executar lighthouse
  lighthouse "$url" \
    --output=html \
    --output=json \
    --output-path=reports/lighthouse/$page_name \
    --chrome-flags="--headless --no-sandbox --disable-gpu" \
    --quiet \
    --only-categories=performance,accessibility,best-practices,seo \
    2>/dev/null || {
      echo "   ❌ Erro ao executar Lighthouse para $page_name"
      echo ""
      continue
    }
  
  # Extrair scores (se jq disponível)
  if [ "$JQ_AVAILABLE" = true ] && [ -f "reports/lighthouse/$page_name.report.json" ]; then
    performance=$(cat reports/lighthouse/$page_name.report.json | jq -r '.categories.performance.score * 100' 2>/dev/null || echo "N/A")
    accessibility=$(cat reports/lighthouse/$page_name.report.json | jq -r '.categories.accessibility.score * 100' 2>/dev/null || echo "N/A")
    best_practices=$(cat reports/lighthouse/$page_name.report.json | jq -r '.categories["best-practices"].score * 100' 2>/dev/null || echo "N/A")
    seo=$(cat reports/lighthouse/$page_name.report.json | jq -r '.categories.seo.score * 100' 2>/dev/null || echo "N/A")
    
    # Armazenar scores para média
    if [ "$performance" != "N/A" ] && [ "$performance" != "null" ]; then
      PERFORMANCE_SCORES+=("$performance")
    fi
    if [ "$accessibility" != "N/A" ] && [ "$accessibility" != "null" ]; then
      ACCESSIBILITY_SCORES+=("$accessibility")
    fi
    if [ "$best_practices" != "N/A" ] && [ "$best_practices" != "null" ]; then
      BEST_PRACTICES_SCORES+=("$best_practices")
    fi
    if [ "$seo" != "N/A" ] && [ "$seo" != "null" ]; then
      SEO_SCORES+=("$seo")
    fi
    
    # Formatação de cores para scores
    format_score() {
      local score=$1
      if [ "$score" = "N/A" ] || [ "$score" = "null" ]; then
        echo "$score"
      elif (( $(echo "$score >= 90" | bc -l) )); then
        echo "✅ $score"
      elif (( $(echo "$score >= 50" | bc -l) )); then
        echo "⚠️  $score"
      else
        echo "❌ $score"
      fi
    }
    
    echo "   📊 Performance:    $(format_score $performance)"
    echo "   ♿ Accessibility:  $(format_score $accessibility)"
    echo "   ✅ Best Practices: $(format_score $best_practices)"
    echo "   🔍 SEO:            $(format_score $seo)"
    echo ""
    echo "   📁 Relatório HTML: reports/lighthouse/$page_name.report.html"
  else
    echo "   ✅ Relatório gerado: reports/lighthouse/$page_name.report.html"
  fi
  
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
done

# Calcular médias
if [ "$JQ_AVAILABLE" = true ]; then
  echo "📊 RESUMO GERAL:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  calc_avg() {
    local scores=("$@")
    if [ ${#scores[@]} -eq 0 ]; then
      echo "N/A"
      return
    fi
    local sum=0
    for score in "${scores[@]}"; do
      sum=$(echo "$sum + $score" | bc)
    done
    echo "scale=2; $sum / ${#scores[@]}" | bc
  }
  
  avg_performance=$(calc_avg "${PERFORMANCE_SCORES[@]}")
  avg_accessibility=$(calc_avg "${ACCESSIBILITY_SCORES[@]}")
  avg_best_practices=$(calc_avg "${BEST_PRACTICES_SCORES[@]}")
  avg_seo=$(calc_avg "${SEO_SCORES[@]}")
  
  echo "📊 Média Performance:    $avg_performance"
  echo "♿ Média Accessibility:  $avg_accessibility"
  echo "✅ Média Best Practices: $avg_best_practices"
  echo "🔍 Média SEO:            $avg_seo"
  echo ""
  
  # Análise da média de performance
  if [ "$avg_performance" != "N/A" ]; then
    if (( $(echo "$avg_performance >= 90" | bc -l) )); then
      echo "✅ Performance média: EXCELENTE (≥90)"
    elif (( $(echo "$avg_performance >= 80" | bc -l) )); then
      echo "✅ Performance média: BOA (80-89)"
    elif (( $(echo "$avg_performance >= 50" | bc -l) )); then
      echo "⚠️  Performance média: ACEITÁVEL (50-79)"
    else
      echo "❌ Performance média: RUIM (<50)"
    fi
  fi
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Lighthouse audit completo!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Relatórios salvos em: reports/lighthouse/"
echo ""
echo "💡 Para visualizar os relatórios HTML:"
echo "   open reports/lighthouse/*.report.html"
echo ""
echo "💡 Para análise detalhada, abra os arquivos .report.html no navegador"
echo ""
