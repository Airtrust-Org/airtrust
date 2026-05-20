#!/bin/bash
# =============================================================================
# CORREÇÃO EM CASCATA - Atualização de código de aeronave
# =============================================================================
# Uso: ./scripts/fix-aeronave-codigo-cascata.sh OLD_CODE NEW_CODE
# Exemplo: ./scripts/fix-aeronave-codigo-cascata.sh "AER123" "AW139"
# =============================================================================

set -e

if [ $# -ne 2 ]; then
  echo "❌ Uso: $0 OLD_CODE NEW_CODE"
  echo "   Exemplo: $0 'AER1761266027229' 'AW139'"
  exit 1
fi

OLD_CODE="$1"
NEW_CODE="$2"
API_URL="https://airtrust-api-production.airtrust.workers.dev/api"

echo "🔄 CORREÇÃO EM CASCATA - AERONAVE"
echo "================================="
echo "De: $OLD_CODE"
echo "Para: $NEW_CODE"
echo ""

# Confirmar
read -p "Continuar? (y/n): " confirm
if [ "$confirm" != "y" ]; then
  echo "Cancelado."
  exit 0
fi

# 1. Verificar se a nova aeronave existe
echo ""
echo "📋 1. Verificando se aeronave '$NEW_CODE' existe..."
AERO_EXISTS=$(curl -s "$API_URL/aeronaves" | jq -r ".data[] | select(.codigo == \"$NEW_CODE\") | .id")
if [ -z "$AERO_EXISTS" ]; then
  echo "❌ ERRO: Aeronave '$NEW_CODE' não existe no sistema!"
  exit 1
fi
echo "   ✅ Aeronave '$NEW_CODE' existe (ID: $AERO_EXISTS)"

# 2. Atualizar simuladores
echo ""
echo "📋 2. Atualizando SIMULADORES..."
SIMULADORES=$(curl -s "$API_URL/simuladores" | jq -r ".data[] | select(.aeronave_codigo == \"$OLD_CODE\") | .id")
SIM_COUNT=0
for id in $SIMULADORES; do
  echo "   Atualizando simulador $id..."
  curl -s -X PUT "$API_URL/simuladores/$id" \
    -H "Content-Type: application/json" \
    -d "{\"aeronave_codigo\": \"$NEW_CODE\"}" > /dev/null
  SIM_COUNT=$((SIM_COUNT + 1))
done
echo "   ✅ $SIM_COUNT simuladores atualizados"

# 3. Atualizar modelos de sessão
echo ""
echo "📋 3. Atualizando MODELOS DE SESSÃO..."
MODELOS=$(curl -s "$API_URL/simuladores/modelos-sessao" | jq -r ".data[] | select(.codigo_aeronave == \"$OLD_CODE\") | .id")
MOD_COUNT=0
for id in $MODELOS; do
  echo "   Atualizando modelo $id..."
  curl -s -X PUT "$API_URL/simuladores/modelos-sessao/$id" \
    -H "Content-Type: application/json" \
    -d "{\"codigo_aeronave\": \"$NEW_CODE\"}" > /dev/null
  MOD_COUNT=$((MOD_COUNT + 1))
done
echo "   ✅ $MOD_COUNT modelos atualizados"

# Resumo
echo ""
echo "================================="
echo "✅ CORREÇÃO CONCLUÍDA"
echo "================================="
echo "Simuladores atualizados: $SIM_COUNT"
echo "Modelos atualizados: $MOD_COUNT"
echo ""
echo "💡 Recomendação: Execute ./scripts/audit-data-integrity.sh para verificar"
