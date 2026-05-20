#!/bin/bash
# =============================================
# PARAR MONITORAMENTO
# =============================================

set -euo pipefail

PID_FILE="monitor.pid"

echo "🛑 PARANDO MONITORAMENTO..."
echo ""

if [ ! -f "$PID_FILE" ]; then
  echo "❌ Nenhum monitoramento em execução (arquivo $PID_FILE não encontrado)"
  exit 1
fi

PID=$(cat "$PID_FILE")

if ! ps -p "$PID" > /dev/null 2>&1; then
  echo "❌ Processo não está rodando (PID: $PID)"
  rm "$PID_FILE"
  exit 1
fi

echo "Enviando sinal de término para processo $PID..."
kill "$PID"

echo "Aguardando finalização..."
sleep 2

if ps -p "$PID" > /dev/null 2>&1; then
  echo "⚠️  Processo ainda rodando, forçando término..."
  kill -9 "$PID" 2>/dev/null || true
  sleep 1
fi

rm "$PID_FILE"

echo ""
echo "✅ MONITORAMENTO PARADO!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RELATÓRIOS GERADOS:"
echo ""

# Listar relatórios
if ls reports/monitoring/summary-*.txt 1> /dev/null 2>&1; then
  LATEST_SUMMARY=$(ls -1t reports/monitoring/summary-*.txt | head -1)
  echo "  Relatório final: $LATEST_SUMMARY"
  echo ""
  echo "Ver relatório:"
  echo "  cat $LATEST_SUMMARY"
  echo ""
else
  echo "  ⚠️  Nenhum relatório final encontrado"
  echo ""
fi

# Listar parciais
PARTIAL_COUNT=$(ls -1 reports/monitoring/partial-report-*.txt 2>/dev/null | wc -l | tr -d ' ')
if [ "$PARTIAL_COUNT" -gt 0 ]; then
  echo "  Relatórios parciais: $PARTIAL_COUNT"
  echo "  Listar: ls -lh reports/monitoring/partial-report-*.txt"
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
