#!/bin/bash
# Teste de 5 minutos do monitoramento V2

echo "🧪 TESTE RÁPIDO - 5 MINUTOS"
echo ""
echo "Este teste irá:"
echo "  ✅ Monitorar logs por 5 minutos"
echo "  ✅ Gerar tráfego de teste a cada 30s"
echo "  ✅ Mostrar contadores em tempo real"
echo ""
echo "Pressione Ctrl+C para parar antes"
echo ""

# Iniciar monitoramento em background
DURATION=0 ./monitor-logs-v2.sh &
MONITOR_PID=$!

echo "Monitor PID: $MONITOR_PID"
sleep 3

# Gerar tráfego de teste
echo "Gerando tráfego de teste..."
for i in {1..10}; do
  echo "Request $i..."
  curl -s https://airtrust-api-production.airtrust.workers.dev/api/health > /dev/null &
  sleep 30
done

# Parar monitoramento
echo ""
echo "Parando monitoramento..."
kill $MONITOR_PID 2>/dev/null || true
wait $MONITOR_PID 2>/dev/null

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 TESTE CONCLUÍDO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Ver relatório:"
echo "  cat \$(ls -1t reports/monitoring/summary-*.txt | head -1)"
echo ""
