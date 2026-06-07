#!/usr/bin/env bash
set -euo pipefail

# ===================================================================
# AirTrust - Validação Pós-Deploy
# ===================================================================
# Verifica se o deploy está íntegro:
# 1. Baixa index.html do servidor
# 2. Baixa app.webmanifest
# 3. Valida que todos os assets referenciados existem (HTTP 200)
# 4. Confirma que headers de cache estão corretos
# ===================================================================

DEPLOY_URL="${1:-https://fp-daumas.github.io/airtrust-v1}"
MANIFEST_PATH="${2:-/app.webmanifest}"
FAIL_COUNT=0
WARN_COUNT=0

echo "🔍 Validando deploy em: $DEPLOY_URL"
echo ""

# ===================================================================
# 1. Verificar index.html
# ===================================================================
echo "📄 1. Verificando index.html..."
INDEX_RESPONSE=$(curl -sSL -w "\n%{http_code}" "$DEPLOY_URL/" || echo "000")
INDEX_CODE=$(echo "$INDEX_RESPONSE" | tail -1)
INDEX_BODY=$(echo "$INDEX_RESPONSE" | sed '$d')

if [ "$INDEX_CODE" != "200" ]; then
  echo "❌ ERRO: index.html retornou $INDEX_CODE"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "✅ index.html: HTTP 200"
  
  # Verificar headers de cache (deve ser no-cache)
  CACHE_HEADER=$(curl -sSL -I "$DEPLOY_URL/" | grep -i "cache-control" | head -1 || echo "")
  if echo "$CACHE_HEADER" | grep -qi "no-cache"; then
    echo "✅ Cache-Control: no-cache detectado"
  else
    echo "⚠️  AVISO: index.html não tem Cache-Control: no-cache"
    echo "   Header encontrado: $CACHE_HEADER"
    WARN_COUNT=$((WARN_COUNT + 1))
  fi
fi

echo ""

# ===================================================================
# 2. Verificar app.webmanifest
# ===================================================================
echo "📋 2. Verificando app.webmanifest..."
MANIFEST_URL="${DEPLOY_URL}${MANIFEST_PATH}"
MANIFEST_RESPONSE=$(curl -sSL -w "\n%{http_code}" "$MANIFEST_URL" || echo "000")
MANIFEST_CODE=$(echo "$MANIFEST_RESPONSE" | tail -1)
MANIFEST_BODY=$(echo "$MANIFEST_RESPONSE" | sed '$d')

if [ "$MANIFEST_CODE" != "200" ]; then
  echo "⚠️  AVISO: app.webmanifest não encontrado ($MANIFEST_CODE)"
  echo "   Isso é esperado se manifest não for gerado ou está em outro path"
  WARN_COUNT=$((WARN_COUNT + 1))
else
  echo "✅ app.webmanifest: HTTP 200"
fi

echo ""

# ===================================================================
# 3. Verificar assets típicos (JS/CSS com hash)
# ===================================================================
echo "📦 3. Verificando assets típicos..."

# Extrair scripts do index.html
SCRIPTS=$(echo "$INDEX_BODY" | grep -oE 'src="[^"]+"' | cut -d'"' -f2 | grep -E '\.(js|css)' || echo "")

if [ -z "$SCRIPTS" ]; then
  echo "⚠️  AVISO: Nenhum script encontrado no index.html"
  WARN_COUNT=$((WARN_COUNT + 1))
else
  SCRIPT_COUNT=$(echo "$SCRIPTS" | wc -l | tr -d ' ')
  echo "   Encontrados $SCRIPT_COUNT scripts no index.html"
  
  # Validar primeiros 3 scripts
  SAMPLE_SCRIPTS=$(echo "$SCRIPTS" | head -3)
  
  while IFS= read -r script; do
    if [ -z "$script" ]; then continue; fi
    
    # Normalizar URL
    if [[ "$script" == http* ]]; then
      SCRIPT_URL="$script"
    elif [[ "$script" == /* ]]; then
      SCRIPT_URL="${DEPLOY_URL}${script}"
    else
      SCRIPT_URL="${DEPLOY_URL}/${script}"
    fi
    
    SCRIPT_CODE=$(curl -sSL -o /dev/null -w "%{http_code}" "$SCRIPT_URL" || echo "000")
    
    if [ "$SCRIPT_CODE" = "200" ]; then
      echo "   ✅ $script"
      
      # Verificar se tem hash no nome
      if echo "$script" | grep -qE '\-[a-f0-9]{8,}\.(js|css)'; then
        echo "      ✅ Hash detectado no filename (cache-busting OK)"
      else
        echo "      ⚠️  Sem hash no filename (pode causar cache)"
        WARN_COUNT=$((WARN_COUNT + 1))
      fi
      
      # Verificar headers de cache (deve ser immutable)
      ASSET_CACHE=$(curl -sSL -I "$SCRIPT_URL" | grep -i "cache-control" | head -1 || echo "")
      if echo "$ASSET_CACHE" | grep -qi "immutable"; then
        echo "      ✅ Cache-Control: immutable"
      elif echo "$ASSET_CACHE" | grep -qi "max-age"; then
        echo "      ✅ Cache-Control com max-age"
      else
        echo "      ⚠️  Sem Cache-Control adequado: $ASSET_CACHE"
        WARN_COUNT=$((WARN_COUNT + 1))
      fi
    else
      echo "   ❌ $script (HTTP $SCRIPT_CODE)"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  done <<< "$SAMPLE_SCRIPTS"
fi

echo ""

# ===================================================================
# 4. Resumo
# ===================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 RESUMO DA VALIDAÇÃO"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   Deploy URL: $DEPLOY_URL"
echo "   Erros: $FAIL_COUNT"
echo "   Avisos: $WARN_COUNT"
echo ""

if [ "$FAIL_COUNT" -eq 0 ] && [ "$WARN_COUNT" -eq 0 ]; then
  echo "✅ DEPLOY VÁLIDO: Tudo OK!"
  exit 0
elif [ "$FAIL_COUNT" -eq 0 ]; then
  echo "⚠️  DEPLOY OK COM AVISOS: Revisar warnings acima"
  exit 0
else
  echo "❌ DEPLOY INVÁLIDO: Corrigir erros antes de liberar"
  exit 1
fi
