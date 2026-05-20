#!/bin/bash

echo "🔧 OTIMIZANDO SELECT * PARA COLUNAS ESPECÍFICAS"
echo "================================================"
echo ""

# Definir colunas principais para cada tabela
declare -A TABLE_COLUMNS=(
  ["funcionarios"]="id, matricula, nome, funcao, setor, status, is_instrutor, is_checador"
  ["qualificacoes"]="id, funcionario_id, tipo, codigo, nome, data_conclusao, data_validade, certificado_url, status"
  ["agendamentos_simulador"]="id, simulador_id, funcionario_id, instrutor_id, data_agendamento, hora_inicio, hora_fim, status, tipo_sessao"
  ["simuladores"]="id, nome, modelo, fabricante, status"
  ["manobras"]="id, codigo, nome, categoria, nivel_dificuldade, pontuacao_maxima, status"
)

echo "📊 ARQUIVOS COM SELECT *:"
files_with_select_star=$(grep -r "SELECT \*" src/worker/api --include="*.ts" -l)
total_files=$(echo "$files_with_select_star" | wc -l | tr -d ' ')
echo "  Total: $total_files arquivos"
echo ""

echo "🎯 TOP 10 ARQUIVOS:"
grep -r "SELECT \*" src/worker/api --include="*.ts" -l | head -10 | nl
echo ""

echo "💡 RECOMENDAÇÃO:"
echo ""
echo "Para cada tabela, substituir:"
echo ""

for table in "${!TABLE_COLUMNS[@]}"; do
  cols="${TABLE_COLUMNS[$table]}"
  echo "  ❌ SELECT * FROM $table"
  echo "  ✅ SELECT $cols FROM $table"
  echo ""
done

echo "⚠️  ATENÇÃO:"
echo "  - Fazer manualmente, arquivo por arquivo"
echo "  - Testar após cada mudança"
echo "  - Verificar se todas as colunas são necessárias"
echo "  - Adicionar/remover colunas conforme necessário"
echo ""

echo "📝 EXEMPLO DE CORREÇÃO:"
echo ""
echo "  // Antes"
echo "  const result = await db.prepare(\`"
echo "    SELECT * FROM funcionarios WHERE id = ?"
echo "  \`).bind(id).first();"
echo ""
echo "  // Depois"
echo "  const result = await db.prepare(\`"
echo "    SELECT id, matricula, nome, funcao, status"
echo "    FROM funcionarios"
echo "    WHERE id = ?"
echo "  \`).bind(id).first();"
echo ""

echo "✅ Para aplicar as mudanças:"
echo "  1. Abrir arquivo com SELECT *"
echo "  2. Identificar tabela sendo consultada"
echo "  3. Substituir * pelas colunas necessárias"
echo "  4. Testar endpoint"
echo "  5. Commit e próximo arquivo"
echo ""
