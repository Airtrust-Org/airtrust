#!/bin/bash
# =============================================
# MONITORAMENTO 24H EM BACKGROUND
# =============================================

set -euo pipefail

PID_FILE="monitor.pid"

echo "🚀 INICIANDO MONITORAMENTO DE 24 HORAS EM BACKGROUND"
echo ""

# Verificar se já está rodando
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if ps -p "$OLD_PID" > /dev/null 2>&1; then
    echo "⚠️  Monitoramento já está rodando (PID: $OLD_PID)"
    echo ""
    echo "Para parar:"
    echo "  ./stop-monitoramento.sh"
    echo ""
    exit 1
  else
    rm "$PID_FILE"
  fi
fi

# Iniciar em background
echo "Iniciando monitoramento..."
nohup ./monitor-production-logs.sh > /dev/null 2>&1 &
echo $! > "$PID_FILE"

echo ""
echo "✅ MONITORAMENTO INICIADO!"
echo ""
echo "PID: $(cat $PID_FILE)"
echo "Duração: 24 horas"
echo "Fim previsto: $(date -v+24H '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -d '+24 hours' '+%Y-%m-%d %H:%M:%S' 2>/dev/null)"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📊 COMANDOS ÚTEIS:"
echo ""
echo "  Ver status:"
echo "    ./status-monitoramento.sh"
echo ""
echo "  Ver logs em tempo real:"
echo "    tail -f reports/monitoring/monitoring-*.log"
echo ""
echo "  Parar monitoramento:"
echo "    ./stop-monitoramento.sh"
echo ""
echo "  Ver relatórios parciais (a cada 6h):"
echo "    ls -lh reports/monitoring/partial-report-*.txt"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
