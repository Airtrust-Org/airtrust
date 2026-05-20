#!/bin/bash
# ============================================================
# Script: Configuração de Lifecycle Policies no R2
# Data: 29/11/2025
# Descrição: Remove automaticamente certificados soft-deleted
#           após 90 dias (GDPR/LGPD compliance)
# ============================================================

set -euo pipefail

BUCKET_NAME="${BUCKET_NAME:-${1:-airtrust-storage}}"

echo "🗑️  Configurando Lifecycle Policy no bucket R2: $BUCKET_NAME"
echo ""

# Lifecycle policy configuration
LIFECYCLE_CONFIG=$(cat <<'EOF'
{
  "Rules": [
    {
      "Id": "delete-soft-deleted-certificates",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "certificados/deleted/"
      },
      "Expiration": {
        "Days": 90
      }
    },
    {
      "Id": "cleanup-temp-uploads",
      "Status": "Enabled",
      "Filter": {
        "Prefix": "uploads/temp-"
      },
      "Expiration": {
        "Days": 1
      }
    },
    {
      "Id": "abort-incomplete-multipart-uploads",
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": {
        "DaysAfterInitiation": 7
      }
    }
  ]
}
EOF
)

echo "📋 Configuração Lifecycle:"
echo "$LIFECYCLE_CONFIG" | jq .
echo ""

# Salvar temporariamente
TEMP_FILE=$(mktemp)
echo "$LIFECYCLE_CONFIG" > "$TEMP_FILE"

echo "⚠️  ATENÇÃO: wrangler CLI não suporta lifecycle policies diretamente."
echo ""
echo "📝 Para configurar Lifecycle Policies, siga estes passos:"
echo ""
echo "1️⃣  Acesse: https://dash.cloudflare.com/"
echo "2️⃣  Navegue para: R2 > $BUCKET_NAME > Settings > Lifecycle Rules"
echo "3️⃣  Configure as regras abaixo:"
echo ""
echo "────────────────────────────────────────────────"
echo "Regra 1: Limpar certificados deletados"
echo "  - Prefix: certificados/deleted/"
echo "  - Action: Delete after 90 days"
echo ""
echo "Regra 2: Limpar uploads temporários"
echo "  - Prefix: uploads/temp-"
echo "  - Action: Delete after 1 day"
echo ""
echo "Regra 3: Abortar uploads incompletos"
echo "  - Action: Abort incomplete multipart uploads after 7 days"
echo "────────────────────────────────────────────────"
echo ""
echo "✅ Após configurar, arquivos antigos serão removidos automaticamente!"
echo ""
echo "📚 Documentação: https://developers.cloudflare.com/r2/buckets/object-lifecycles/"

# Cleanup
rm -f "$TEMP_FILE"

# Nota sobre soft delete
echo ""
echo "💡 DICA: Atualize o código para mover arquivos soft-deleted:"
echo ""
echo "  // Ao fazer soft delete no D1"
echo "  const oldKey = doc.r2_key;"
echo "  const newKey = oldKey.replace('certificados/', 'certificados/deleted/');"
echo "  await bucket.head(oldKey) && await bucket.put(newKey, await bucket.get(oldKey));"
echo "  await bucket.delete(oldKey);"
echo ""
