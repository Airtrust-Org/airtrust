#!/usr/bin/env bash
set -euo pipefail

# ===================================================================
# AirTrust - Purge Cache Cloudflare
# ===================================================================
# Limpa cache do Cloudflare após deploy para garantir que usuários
# recebam a versão mais recente do app.
#
# Requer:
# - CLOUDFLARE_API_TOKEN (env var ou .env)
# - CLOUDFLARE_ZONE_ID (env var ou .env)
#
# Uso:
#   ./scripts/purge-cloudflare-cache.sh
#   ./scripts/purge-cloudflare-cache.sh --all  # Limpa TUDO (use com cuidado)
# ===================================================================

# Carregar .env se existir
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Validar variáveis
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "❌ ERRO: CLOUDFLARE_API_TOKEN não definido"
  echo "   Configure em .env ou variável de ambiente"
  exit 1
fi

if [ -z "${CLOUDFLARE_ZONE_ID:-}" ]; then
  echo "❌ ERRO: CLOUDFLARE_ZONE_ID não definido"
  echo "   Configure em .env ou variável de ambiente"
  exit 1
fi

PURGE_ALL="${1:-}"

echo "🔄 Iniciando purge do cache Cloudflare..."
echo ""

if [ "$PURGE_ALL" = "--all" ]; then
  # Purge TUDO (use apenas em emergências)
  echo "⚠️  PURGE COMPLETO: Limpando TODO o cache da zone"
  echo "   Isso pode impactar performance temporariamente"
  read -p "   Confirma? (y/N): " -n 1 -r
  echo
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Cancelado"
    exit 0
  fi
  
  RESPONSE=$(curl -sS -X POST \
    "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"purge_everything": true}')
  
else
  # Purge seletivo (apenas HTML e manifest)
  echo "🎯 PURGE SELETIVO: Limpando apenas index.html e manifest.json"
  
  # URLs a limpar
  FILES=(
    "/"
    "/index.html"
    "/manifest.json"
  )
  
  # Construir JSON array
  JSON_FILES=$(printf ',"%s"' "${FILES[@]}")
  JSON_FILES="[${JSON_FILES:1}]"
  
  # Se tiver custom domain, ajustar
  DOMAIN="${CLOUDFLARE_DOMAIN:-https://airtrust.online}"
  
  # Construir full URLs
  FULL_URLS=()
  for file in "${FILES[@]}"; do
    FULL_URLS+=("${DOMAIN}${file}")
  done
  
  JSON_URLS=$(printf ',"%s"' "${FULL_URLS[@]}")
  JSON_URLS="[${JSON_URLS:1}]"
  
  echo "   URLs a limpar:"
  for url in "${FULL_URLS[@]}"; do
    echo "   - $url"
  done
  echo ""
  
  RESPONSE=$(curl -sS -X POST \
    "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"files\": ${JSON_URLS}}")
fi

# Verificar resposta
SUCCESS=$(echo "$RESPONSE" | grep -o '"success":\s*true' || echo "")

if [ -n "$SUCCESS" ]; then
  echo "✅ Cache purgado com sucesso!"
  echo ""
  echo "📝 Detalhes:"
  echo "$RESPONSE" | grep -o '"id":"[^"]*"' || echo "   (sem ID retornado)"
else
  echo "❌ ERRO ao purgar cache"
  echo ""
  echo "📝 Resposta da API:"
  echo "$RESPONSE"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Purge concluído!"
echo ""
echo "⏱️  Aguarde 1-2 minutos para propagação global"
echo "🔄 Usuários receberão nova versão no próximo reload"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
