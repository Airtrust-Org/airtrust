#!/bin/bash
# =============================================================================
# AUDITORIA DE INTEGRIDADE DE DADOS - AirTrust
# =============================================================================
# Uso: ./scripts/audit-data-integrity.sh
# =============================================================================

set -e

API_URL="https://airtrust-api-production.airtrust.workers.dev/api"
ERRORS=0

echo "🔍 AUDITORIA DE INTEGRIDADE DE DADOS"
echo "===================================="
echo "Data: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 1. Verificar aeronaves
echo "📋 1. Verificando AERONAVES..."
AERONAVES=$(curl -s "$API_URL/aeronaves" | jq -r '.data[].codigo' | sort)
echo "   Aeronaves cadastradas: $(echo "$AERONAVES" | wc -l | tr -d ' ')"
echo "   Códigos: $(echo $AERONAVES | tr '\n' ', ')"
echo ""

# 2. Verificar simuladores
echo "📋 2. Verificando SIMULADORES..."
SIMULADORES=$(curl -s "$API_URL/simuladores" | jq -r '.data[] | "\(.id)|\(.nome)|\(.aeronave_codigo)"')
while IFS='|' read -r id nome aero_codigo; do
  if [ -n "$aero_codigo" ] && ! echo "$AERONAVES" | grep -q "^$aero_codigo$"; then
    echo "   ❌ ERRO: Simulador $id ($nome) tem aeronave_codigo '$aero_codigo' que não existe!"
    ERRORS=$((ERRORS + 1))
  else
    echo "   ✅ Simulador $id: aeronave_codigo='$aero_codigo' OK"
  fi
done <<< "$SIMULADORES"
echo ""

# 3. Verificar modelos de sessão
echo "📋 3. Verificando MODELOS DE SESSÃO..."
MODELOS=$(curl -s "$API_URL/simuladores/modelos-sessao" | jq -r '.data[] | "\(.id)|\(.nome)|\(.codigo_aeronave)|\(.tipo_aeronave)"')
MODELO_COUNT=0
MODELO_ERROS=0
while IFS='|' read -r id nome cod_aero tipo_aero; do
  MODELO_COUNT=$((MODELO_COUNT + 1))
  if [ -n "$cod_aero" ] && ! echo "$AERONAVES" | grep -q "^$cod_aero$"; then
    echo "   ❌ ERRO: Modelo $id tem codigo_aeronave '$cod_aero' que não existe!"
    MODELO_ERROS=$((MODELO_ERROS + 1))
    ERRORS=$((ERRORS + 1))
  fi
done <<< "$MODELOS"
echo "   Total modelos: $MODELO_COUNT | Erros: $MODELO_ERROS"
echo ""

# 4. Verificar tipos de sessão
echo "📋 4. Verificando TIPOS DE SESSÃO..."
TIPOS=$(curl -s "$API_URL/simuladores/tipos-sessao" | jq -r '.data[] | "\(.id)|\(.codigo)|\(.nome)"')
TIPO_COUNT=$(echo "$TIPOS" | wc -l | tr -d ' ')
echo "   Total tipos: $TIPO_COUNT"
echo ""

# 5. Verificar funcionários
echo "📋 5. Verificando FUNCIONÁRIOS..."
FUNC_COUNT=$(curl -s "$API_URL/funcionarios?limit=1" | jq -r '.total // 0')
echo "   Total funcionários: $FUNC_COUNT"
echo ""

# 6. Verificar qualificações históricas
echo "📋 6. Verificando QUALIFICAÇÕES HISTÓRICAS..."
QUAL_COUNT=$(curl -s "$API_URL/qualificacoes/historico?limit=1" | jq -r '.total // 0')
echo "   Total registros histórico: $QUAL_COUNT"
echo ""

# 7. Verificar fichas de sessão
echo "📋 7. Verificando FICHAS DE SESSÃO..."
FICHAS_COUNT=$(curl -s "$API_URL/simuladores/fichas?limit=1" | jq -r '.total // (.data | length) // 0')
echo "   Total fichas: $FICHAS_COUNT"
echo ""

# Resumo
echo "===================================="
echo "📊 RESUMO DA AUDITORIA"
echo "===================================="
if [ $ERRORS -eq 0 ]; then
  echo "✅ NENHUM ERRO DE INTEGRIDADE ENCONTRADO!"
else
  echo "❌ ENCONTRADOS $ERRORS ERROS DE INTEGRIDADE"
  echo ""
  echo "⚠️  Execute as correções necessárias!"
fi
echo ""
echo "Auditoria concluída em $(date '+%Y-%m-%d %H:%M:%S')"
