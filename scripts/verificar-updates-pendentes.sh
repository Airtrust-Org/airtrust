#!/bin/bash

echo "🔍 VERIFICANDO 10 ARQUIVOS PENDENTES DE AUDITORIA"
echo "=================================================="
echo ""

# Lista de arquivos para verificar
ARQUIVOS=(
  "src/worker/api/v2/simuladores-modelos.ts"
  "src/worker/api/v2/manobras.ts"
  "src/worker/api/v2/aeronaves.ts"
  "src/worker/api/v2/exames-crud.ts"
  "src/worker/api/v2/templates.ts"
  "src/worker/api/v2/simulador-fichas-crud.ts"
  "src/worker/api/v2/simuladores-consolidado/crud.ts"
  "src/worker/api/v2/simuladores-consolidado/templates/index.ts"
  "src/worker/api/v2/simuladores-consolidado/manobras/index.ts"
  "src/worker/api/v2/treinamentos-sessoes.ts"
  "src/worker/api/v2/treinamentos/sessoes.ts"
)

total_arquivos=0
arquivos_com_put=0
arquivos_ok=0
arquivos_problema=0

for arquivo in "${ARQUIVOS[@]}"; do
  if [ ! -f "$arquivo" ]; then
    echo "⚠️  Arquivo não encontrado: $arquivo"
    continue
  fi
  
  ((total_arquivos++))
  
  # Verificar se tem endpoint PUT
  if grep -q "app\.put" "$arquivo"; then
    ((arquivos_com_put++))
    echo "📄 $arquivo"
    
    # Mostrar linha do PUT
    grep -n "app\.put" "$arquivo" | head -1
    
    # Contar campos no UPDATE
    update_count=$(grep -A 20 "UPDATE" "$arquivo" | grep -E "^\s+\w+\s*=" | wc -l | tr -d ' ')
    
    if [ "$update_count" -gt 5 ]; then
      echo "   ✅ OK: $update_count campos sendo atualizados"
      ((arquivos_ok++))
    elif [ "$update_count" -gt 0 ]; then
      echo "   ⚠️  VERIFICAR: Apenas $update_count campos"
      ((arquivos_problema++))
      
      # Mostrar UPDATE
      echo "   UPDATE encontrado:"
      grep -A 10 "UPDATE" "$arquivo" | head -12 | sed 's/^/      /'
    else
      echo "   ⚠️  Nenhum UPDATE encontrado (pode usar dinâmico)"
    fi
    
    echo ""
  else
    echo "⏭️  $arquivo (sem endpoint PUT)"
    echo ""
  fi
done

echo "=================================================="
echo "📊 RESUMO:"
echo "   Total de arquivos verificados: $total_arquivos"
echo "   Arquivos com PUT: $arquivos_com_put"
echo "   Arquivos OK: $arquivos_ok"
echo "   Arquivos para verificar: $arquivos_problema"
echo ""

if [ $arquivos_problema -gt 0 ]; then
  echo "⚠️  $arquivos_problema arquivo(s) precisam de revisão manual"
else
  echo "✅ Todos os arquivos estão OK!"
fi
