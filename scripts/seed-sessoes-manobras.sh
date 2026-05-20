#!/bin/bash
# seed-sessoes-manobras.sh
# Script para popular banco de dados com sessões e manobras do CSV
# Data: 2025-12-01

set -e

API_BASE_URL="${API_BASE_URL:-https://airtrust-api-production.airtrust.workers.dev}"
JSON_FILE="scripts/seed-sessoes-csv.json"

echo "🚁 ====================================="
echo "   SEED: SESSÕES & MANOBRAS (CSV)"
echo "======================================"
echo ""
echo "📍 API Base: $API_BASE_URL"
echo "📄 Source: $JSON_FILE"
echo ""

# Verificar se arquivo existe
if [ ! -f "$JSON_FILE" ]; then
  echo "❌ Arquivo $JSON_FILE não encontrado!"
  exit 1
fi

# Função para fazer requisição POST
post_request() {
  local endpoint="$1"
  local payload="$2"
  
  curl -s -X POST \
    "$API_BASE_URL$endpoint" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

echo "📊 Lendo JSON..."
SESSIONS=$(cat "$JSON_FILE" | jq -c '.sessions[]')

TOTAL_SESSIONS=$(echo "$SESSIONS" | wc -l | tr -d ' ')
CURRENT=0

echo "✅ Total de sessões: $TOTAL_SESSIONS"
echo ""

# 1. Primeiro, criar todas as manobras únicas
echo "🔧 FASE 1: Criando manobras únicas"
echo "================================="

# Extrair todas as manobras únicas
ALL_MANOBRAS=$(echo "$SESSIONS" | jq -r '.manobras[] | "\(.codigo)|@@@|\(.descricao)"' | sort -u)

MANOBRA_COUNT=0
while IFS= read -r manobra; do
  CODIGO=$(echo "$manobra" | cut -d'|' -f1)
  DESCRICAO=$(echo "$manobra" | cut -d'|' -f3)
  
  # Tentar criar manobra (ignora se já existe)
  PAYLOAD=$(jq -n \
    --arg codigo "$CODIGO" \
    --arg desc "$DESCRICAO" \
    '{
      codigo: $codigo,
      descricao: $desc,
      categoria: "PROCEDIMENTO",
      tipo_sessao: "TREINAMENTO",
      tipo_aeronave: "AW139",
      duracao_estimada: 5,
      peso: 1,
      critica: 0
    }')
  
  RESULT=$(post_request "/api/simuladores/manobras" "$PAYLOAD")
  
  if echo "$RESULT" | jq -e '.success' > /dev/null 2>&1; then
    MANOBRA_COUNT=$((MANOBRA_COUNT + 1))
    echo "  ✅ $CODIGO - $DESCRICAO"
  else
    # Se já existe, não é erro
    echo "  ⏭️  $CODIGO (já existe)"
  fi
  
done <<< "$ALL_MANOBRAS"

echo ""
echo "✅ Fase 1 completa: $MANOBRA_COUNT manobras criadas"
echo ""

# 2. Criar sessões templates com suas manobras
echo "🎯 FASE 2: Criando sessões templates"
echo "===================================="

while IFS= read -r session; do
  CURRENT=$((CURRENT + 1))
  
  SESSAO_ID=$(echo "$session" | jq -r '.id')
  TEMA=$(echo "$session" | jq -r '.tema')
  TIPO_SESSAO=$(echo "$session" | jq -r '.tipo_sessao')
  TIPO_AERONAVE=$(echo "$session" | jq -r '.tipo_aeronave')
  MANOBRAS=$(echo "$session" | jq -c '.manobras')
  
  echo ""
  echo "[$CURRENT/$TOTAL_SESSIONS] Sessão $SESSAO_ID: $TEMA"
  echo "─────────────────────────────────────────────"
  
  # Criar payload da sessão template
  PAYLOAD=$(jq -n \
    --arg tema "$TEMA" \
    --arg tipo "$TIPO_SESSAO" \
    --arg aeronave "$TIPO_AERONAVE" \
    --argjson manobras "$MANOBRAS" \
    '{
      tema: $tema,
      tipo_sessao: $tipo,
      tipo_aeronave: $aeronave,
      manobras: $manobras
    }')
  
  # Criar sessão template
  RESULT=$(post_request "/api/simuladores/sessoes-template" "$PAYLOAD")
  
  if echo "$RESULT" | jq -e '.success' > /dev/null 2>&1; then
    MANOBRA_COUNT=$(echo "$MANOBRAS" | jq 'length')
    echo "  ✅ Sessão criada com $MANOBRA_COUNT manobras"
  else
    ERROR_MSG=$(echo "$RESULT" | jq -r '.error // "Erro desconhecido"')
    echo "  ❌ Erro: $ERROR_MSG"
  fi
  
done <<< "$SESSIONS"

echo ""
echo "🎉 ====================================="
echo "   SEED COMPLETO!"
echo "======================================"
echo ""
echo "📊 Resumo:"
echo "  - Manobras únicas criadas: $MANOBRA_COUNT"
echo "  - Sessões processadas: $TOTAL_SESSIONS"
echo ""
echo "🔍 Verifique no sistema:"
echo "   Gestão → Templates de Manobras → Nova Sessão"
echo ""
