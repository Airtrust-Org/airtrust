#!/bin/bash

echo "🔍 VALIDAÇÃO DE SCHEMAS SQL"
echo "============================"
echo ""

# Tabelas principais para validar
TABLES=(
  "funcionarios"
  "qualificacoes"
  "agendamentos_simulador"
  "simuladores"
  "manobras"
  "simulador_templates"
  "simulador_template_manobras"
)

echo "📋 SCHEMAS DAS TABELAS PRINCIPAIS:"
echo ""

for table in "${TABLES[@]}"; do
  echo "📊 Tabela: $table"
  echo "   Procurando definição..."
  
  # Procurar CREATE TABLE na migration mais recente
  grep -r "CREATE TABLE.*$table" migrations --include="*.sql" -A 20 | head -25 | grep -v "^--"
  
  echo ""
  echo "   Procurando uso em queries..."
  grep -r "FROM $table\|JOIN $table" src/worker/api --include="*.ts" | wc -l | xargs echo "   Queries encontradas:"
  echo ""
  echo "---"
done

echo ""
echo "⚠️  COLUNAS PROBLEMÁTICAS CONHECIDAS:"
echo ""
echo "1. agendamentos_simulador:"
echo "   ❌ 'data' (não existe)"
echo "   ✅ 'data_agendamento' (correto)"
echo "   ❌ 'template_id' (não existe)"
echo ""

echo "2. qualificacoes:"
echo "   ✅ 'certificado_url' (existe)"
echo "   ✅ 'data_conclusao' (existe)"
echo "   ✅ 'data_validade' (existe)"
echo ""

echo "3. funcionarios:"
echo "   ✅ 'matricula' (existe)"
echo "   ✅ 'is_instrutor' (existe)"
echo "   ✅ 'is_checador' (existe)"
echo ""

echo "✅ VALIDAÇÃO CONCLUÍDA"
echo ""
echo "💡 Para ver schema completo de uma tabela:"
echo "   curl 'URL/api/v2/system/schema?table=NOME_TABELA'"
