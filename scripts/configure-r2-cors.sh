#!/bin/bash
# ============================================================
# Script: Configuração de CORS no R2 para uploads diretos
# Data: 29/11/2025
# Descrição: Configura políticas de CORS para permitir upload
#           direto do frontend para o bucket R2
# ============================================================

set -euo pipefail

BUCKET_NAME="${BUCKET_NAME:-${1:-airtrust-storage}}"

echo "🔧 Configurando CORS no bucket R2: $BUCKET_NAME"
echo ""

# CORS configuration
CORS_CONFIG=$(cat <<'EOF'
[
  {
    "AllowedOrigins": [
      "https://airtrust-web-production.pages.dev",
      "https://*.airtrust.workers.dev",
      "http://localhost:3000",
      "http://localhost:5173"
    ],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": [
      "Content-Type",
      "Content-Length",
      "Authorization",
      "X-Requested-With",
      "Range"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Length",
      "Content-Range"
    ],
    "MaxAgeSeconds": 3600
  }
]
EOF
)

echo "📋 Configuração CORS:"
echo "$CORS_CONFIG" | jq .
echo ""

# Salvar temporariamente
TEMP_FILE=$(mktemp)
echo "$CORS_CONFIG" > "$TEMP_FILE"

# Aplicar configuração
echo "🚀 Aplicando configuração..."

# Nota: wrangler não tem comando direto para CORS, deve ser feito via Dashboard ou API
echo "⚠️  ATENÇÃO: wrangler CLI não suporta configuração de CORS diretamente."
echo ""
echo "📝 Para configurar CORS, siga estes passos:"
echo ""
echo "1️⃣  Acesse: https://dash.cloudflare.com/"
echo "2️⃣  Navegue para: R2 > $BUCKET_NAME > Settings > CORS Policy"
echo "3️⃣  Cole a configuração abaixo:"
echo ""
echo "────────────────────────────────────────────────"
cat "$TEMP_FILE" | jq .
echo "────────────────────────────────────────────────"
echo ""
echo "4️⃣  Clique em 'Save'"
echo ""
echo "✅ Após configurar, uploads diretos do frontend funcionarão!"
echo ""
echo "📚 Documentação: https://developers.cloudflare.com/r2/buckets/cors/"

# Cleanup
rm -f "$TEMP_FILE"
