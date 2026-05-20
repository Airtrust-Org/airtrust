#!/bin/bash
# =============================================
# TESTE ULTRA SIMPLES - SEM MUDAR DIRETÓRIO
# =============================================

echo "🔍 TESTE ULTRA SIMPLES"
echo "Diretório atual: $(pwd)"
echo ""

# Criar diretório e arquivo
mkdir -p reports/monitoring
LOG_FILE="reports/monitoring/teste-ultra-simples.log"
echo "Arquivo de log: $LOG_FILE"
echo ""

# Garantir que arquivo existe
touch "$LOG_FILE"
echo "Teste inicial" > "$LOG_FILE"

echo "Capturando logs do wrangler (30 segundos)..."
echo ""

cd worker-airtrust
wrangler tail --env production 2>&1 | head -20 >> "../$LOG_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Conteúdo capturado:"
cat "../$LOG_FILE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
