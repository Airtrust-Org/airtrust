#!/bin/bash

# Analisa logs do Cloudflare Workers
# Uso: ./analyze-logs.sh [filtro] [last_N_minutes]

FILTER=${1:-ERROR}
MINUTES=${2:-60}

echo "🔍 Analisando logs dos últimos $MINUTES minutos..."
echo "📊 Filtro: $FILTER"
echo ""

wrangler tail --env production --format=json | \
  jq -r "select(.level == \"$FILTER\") | 
    \"[\(.context.timestamp)] [\(.level)] \(.context.module)
    📝 \(.message)
    🆔 Request: \(.context.requestId)
    👤 User: \(.context.userEmail // \"anônimo\")
    ⏱️  Duração: \(.duration)ms
    
    \(if .data then \"📊 Dados: \" + (.data | tostring) else \"\" end)
    \(if .error then \"💥 Erro: \" + .error.message else \"\" end)
    ───────────────────────────────────────────────────────────────────────────
    \"" | \
  head -n 50
