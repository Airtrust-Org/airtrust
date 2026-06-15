#!/usr/bin/env bash
set -euo pipefail

echo "🔧 OTIMIZANDO TODOS OS SELECT * AUTOMATICAMENTE"
echo "================================================"
echo ""

if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree suja. Este script altera arquivos em massa."
  echo "   Faça backup/stage seletivo manualmente e rode novamente em uma árvore limpa."
  exit 1
fi

# Definir substituições para cada tabela
declare -A REPLACEMENTS=(
  ["SELECT \* FROM funcionarios"]="SELECT id, matricula, nome, funcao, setor, status, is_instrutor, is_checador, email, telefone, data_admissao, created_at, updated_at FROM funcionarios"
  ["SELECT \* FROM qualificacoes"]="SELECT id, funcionario_id, tipo, codigo, nome, data_conclusao, data_validade, certificado_url, instrutor, nota_final, status, is_renovada, created_at, updated_at FROM qualificacoes"
  ["SELECT \* FROM agendamentos_simulador"]="SELECT id, simulador_id, funcionario_id, instrutor_id, data_agendamento, hora_inicio, hora_fim, status, tipo_sessao, observacoes, resultado, nota, created_at, updated_at FROM agendamentos_simulador"
  ["SELECT \* FROM simuladores"]="SELECT id, nome, modelo, fabricante, numero_serie, status, localizacao, observacoes, created_at, updated_at FROM simuladores"
  ["SELECT \* FROM manobras"]="SELECT id, codigo, nome, descricao, categoria, nivel_dificuldade, tempo_estimado, pontuacao_maxima, status, created_at, updated_at FROM manobras"
  ["SELECT \* FROM tipos_qualificacoes"]="SELECT id, codigo, nome, descricao, validade_meses, categoria, status, created_at, updated_at FROM tipos_qualificacoes"
  ["SELECT \* FROM exames"]="SELECT id, codigo, nome, descricao, tipo, status, created_at, updated_at FROM exames"
  ["SELECT \* FROM checks"]="SELECT id, codigo, nome, descricao, tipo, status, created_at, updated_at FROM checks"
)

count=0

for pattern in "${!REPLACEMENTS[@]}"; do
  replacement="${REPLACEMENTS[$pattern]}"
  
  # Encontrar e substituir em todos os arquivos .ts
  files=$(grep -rl "$pattern" src/worker/api --include="*.ts" 2>/dev/null)
  
  if [ -n "$files" ]; then
    echo "🔄 Substituindo: $pattern"
    echo "$files" | while read file; do
      sed -i '' "s|$pattern|$replacement|g" "$file"
      echo "  ✅ $file"
      ((count++))
    done
    echo ""
  fi
done

echo "✅ Otimização concluída!"
echo "📊 Total de substituições: $count"
echo ""
echo "🧪 Testando build..."
npm run build

if [ $? -eq 0 ]; then
  echo "✅ Build OK!"
  echo ""
  echo "💾 Revise com git diff e faça stage seletivo manualmente."
else
  echo "❌ Build falhou! Revise o diff e reverta seletivamente."
  exit 1
fi
