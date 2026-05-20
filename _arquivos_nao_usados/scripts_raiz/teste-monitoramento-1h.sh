#!/bin/bash
# =============================================
# TESTE RÁPIDO DO MONITORAMENTO - 1 HORA
# =============================================

set -euo pipefail

echo "🚀 INICIANDO TESTE DE MONITORAMENTO - 1 HORA"
echo ""
echo "Este teste irá:"
echo "  ✅ Monitorar logs de produção por 1 hora"
echo "  ✅ Gerar relatório parcial ao final"
echo "  ✅ Validar funcionamento do script completo"
echo ""
echo "Pressione Ctrl+C para parar antes de 1 hora."
echo ""

# Executar por 1 hora
DURATION=1 ./monitor-production-logs.sh

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 TESTE CONCLUÍDO!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📁 Arquivos gerados:"
echo "  - $(ls -1t reports/monitoring/monitoring-*.log 2>/dev/null | head -1 || echo 'N/A')"
echo "  - $(ls -1t reports/monitoring/summary-*.txt 2>/dev/null | head -1 || echo 'N/A')"
echo ""
echo "Ver relatório final:"
echo "  cat \$(ls -1t reports/monitoring/summary-*.txt | head -1)"
echo ""
