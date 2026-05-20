#!/bin/bash
# =============================================
# STATUS DO MONITORAMENTO
# =============================================

set -euo pipefail

PID_FILE="monitor.pid"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 STATUS DO MONITORAMENTO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ ! -f "$PID_FILE" ]; then
  echo "❌ Nenhum monitoramento em execução"
  echo ""
  echo "Para iniciar:"
  echo "  ./start-monitoramento-24h.sh"
  echo ""
  exit 0
fi

PID=$(cat "$PID_FILE")

if ! ps -p "$PID" > /dev/null 2>&1; then
  echo "❌ Processo não está rodando (PID: $PID)"
  rm "$PID_FILE"
  echo ""
  exit 1
fi

echo "✅ MONITORAMENTO ATIVO"
echo ""
echo "PID: $PID"

# Tempo de execução
if ps -p "$PID" -o etime= > /dev/null 2>&1; then
  UPTIME=$(ps -p "$PID" -o etime= | tr -d ' ')
  echo "Tempo de execução: $UPTIME"
fi

# Tamanho dos logs
if ls reports/monitoring/monitoring-*.log 1> /dev/null 2>&1; then
  LATEST_LOG=$(ls -1t reports/monitoring/monitoring-*.log | head -1)
  LOG_SIZE=$(du -h "$LATEST_LOG" | cut -f1)
  echo "Tamanho do log: $LOG_SIZE"
  echo ""
  echo "Log ativo: $LATEST_LOG"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📈 ESTATÍSTICAS (últimas 10 linhas):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ -f "$LATEST_LOG" ]; then
  tail -10 "$LATEST_LOG" | grep -E "CRÍTICO|AVISO" || echo "  Nenhum erro recente ✅"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Comandos:"
echo "  Ver logs: tail -f $LATEST_LOG"
echo "  Parar: ./stop-monitoramento.sh"
echo ""
