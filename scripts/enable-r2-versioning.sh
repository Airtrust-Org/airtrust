#!/bin/bash
# ============================================================
# Script: Habilitar versionamento no R2 para backup automático
# Data: 29/11/2025
# Descrição: Ativa versionamento no bucket R2 para proteção
#           contra deleção acidental
# ============================================================

set -euo pipefail

BUCKET_NAME="${BUCKET_NAME:-${1:-airtrust-storage}}"

echo "🔒 Habilitando versionamento no bucket R2: $BUCKET_NAME"
echo ""

echo "⚠️  ATENÇÃO: wrangler CLI não suporta versionamento diretamente."
echo ""
echo "📝 Para habilitar versionamento, siga estes passos:"
echo ""
echo "1️⃣  Acesse: https://dash.cloudflare.com/"
echo "2️⃣  Navegue para: R2 > $BUCKET_NAME > Settings"
echo "3️⃣  Encontre a seção 'Object Versioning'"
echo "4️⃣  Clique em 'Enable Versioning'"
echo ""
echo "────────────────────────────────────────────────"
echo "🎯 BENEFÍCIOS DO VERSIONAMENTO:"
echo ""
echo "✅ Proteção contra deleção acidental"
echo "✅ Histórico de alterações em arquivos"
echo "✅ Recuperação de versões anteriores"
echo "✅ Compliance com políticas de backup"
echo ""
echo "────────────────────────────────────────────────"
echo ""
echo "💡 Após habilitar, use estas APIs:"
echo ""
echo "  # Listar versões de um objeto"
echo "  await bucket.list({ prefix: 'certificados/CERT-123.pdf', versions: true });"
echo ""
echo "  # Obter versão específica"
echo "  await bucket.get('certificados/CERT-123.pdf', { versionId: 'xxx' });"
echo ""
echo "  # Restaurar versão anterior"
echo "  const oldVersion = await bucket.get(key, { versionId: 'xxx' });"
echo "  await bucket.put(key, oldVersion.body);"
echo ""
echo "📚 Documentação: https://developers.cloudflare.com/r2/buckets/versioning/"
echo ""
echo "⚠️  CUSTO: Cada versão conta para o storage total do bucket"
echo "   Configure lifecycle rules para limpar versões antigas!"
