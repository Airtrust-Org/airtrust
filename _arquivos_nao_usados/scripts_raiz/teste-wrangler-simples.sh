#!/bin/bash
# =============================================
# TESTE SIMPLIFICADO DO WRANGLER TAIL
# =============================================

set -euo pipefail

echo "🔍 TESTE SIMPLIFICADO - WRANGLER TAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Duração: 30 segundos"
echo "Início: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Criar diretório
mkdir -p reports/monitoring

# Arquivo de log
LOG_FILE="reports/monitoring/teste-simplificado-$(date +%Y%m%d-%H%M%S).log"

echo "Iniciando captura de logs..."
echo ""

# Contador
LINES=0

# Capturar por 30 segundos
cd worker-airtrust 2>/dev/null

wrangler tail --env production 2>&1 | while IFS= read -r line; do
  LINES=$((LINES + 1))
  echo "[$LINES] $line" | tee -a "$LOG_FILE"
  
  # Parar após 30 segundos
  if [ $LINES -ge 50 ]; then
    echo ""
    echo "Limite de 50 linhas atingido. Parando..."
    break
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESULTADO:"
echo "  Linhas capturadas: $LINES"
echo "  Log salvo: $LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
