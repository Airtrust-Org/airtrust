#!/bin/bash

echo "🔍 VALIDANDO QUERIES SQL CONTRA SCHEMAS"
echo "========================================"
echo ""

# Colunas problemáticas conhecidas
PATTERNS=(
  "template_id:Coluna 'template_id' não existe em agendamentos_simulador"
  "a\.data :Usar 'data_agendamento' ao invés de 'a.data' em agendamentos_simulador"
)

errors=0

echo "📋 VERIFICANDO COLUNAS PROBLEMÁTICAS:"
echo ""

for item in "${PATTERNS[@]}"; do
  IFS=':' read -ra PARTS <<< "$item"
  pattern="${PARTS[0]}"
  msg="${PARTS[1]}"
  
  matches=$(grep -rE "$pattern" src/worker/api --include="*.ts" | grep -v "//" | grep -v "data_agendamento" | wc -l | tr -d ' ')
  
  if [ "$matches" -gt 0 ]; then
    echo "⚠️  Encontrado $matches uso(s) de padrão problemático:"
    echo "    Padrão: $pattern"
    echo "    Problema: $msg"
    echo ""
    
    # Mostrar exemplos
    echo "    Exemplos:"
    grep -rE "$pattern" src/worker/api --include="*.ts" -n | grep -v "//" | grep -v "data_agendamento" | head -3 | sed 's/^/      /'
    echo ""
    
    ((errors++))
  fi
done

echo "📊 VERIFICANDO SELECT *:"
echo ""

select_star=$(grep -r "SELECT \*" src/worker/api --include="*.ts" | wc -l | tr -d ' ')
echo "  SELECT * encontrados: $select_star"

if [ "$select_star" -gt 0 ]; then
  echo "  ⚠️  Recomendação: Especificar colunas ao invés de SELECT *"
  echo ""
  echo "  Top 5 arquivos com SELECT *:"
  grep -r "SELECT \*" src/worker/api --include="*.ts" -l | head -5 | sed 's/^/    /'
  echo ""
fi

echo "📊 VERIFICANDO SOFT DELETE:"
echo ""

# Verificar queries sem deleted_at
queries_without_soft_delete=$(grep -r "FROM funcionarios\|FROM qualificacoes\|FROM agendamentos_simulador" src/worker/api --include="*.ts" | grep -v "deleted_at IS NULL" | grep -v "//" | wc -l | tr -d ' ')

if [ "$queries_without_soft_delete" -gt 0 ]; then
  echo "  ⚠️  $queries_without_soft_delete queries sem 'deleted_at IS NULL'"
  echo "  Sempre adicionar: WHERE deleted_at IS NULL"
  echo ""
fi

echo "═══════════════════════════════════════"

if [ $errors -eq 0 ] && [ "$select_star" -eq 0 ] && [ "$queries_without_soft_delete" -eq 0 ]; then
  echo "✅ TODAS AS VALIDAÇÕES PASSARAM!"
else
  echo "⚠️  ENCONTRADOS $errors PROBLEMAS"
  echo ""
  echo "💡 AÇÕES RECOMENDADAS:"
  echo "  1. Revisar queries problemáticas"
  echo "  2. Consultar docs/database-schema.md"
  echo "  3. Corrigir e testar"
fi

echo ""
