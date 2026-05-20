#!/bin/bash

echo "🔍 AUDITORIA: QUERIES UPDATE/INSERT INCOMPLETAS"
echo "================================================"
echo ""

# Procurar todos os endpoints PUT
echo "1️⃣ ENDPOINTS PUT ENCONTRADOS:"
echo ""
grep -r "app.put" src/worker/api --include="*.ts" | cut -d: -f1 | sort -u | nl
echo ""

# Procurar UPDATEs que podem estar incompletos
echo "2️⃣ VERIFICANDO UPDATES POTENCIALMENTE INCOMPLETOS:"
echo ""

# Função para verificar UPDATE
check_update() {
  local file=$1
  local table=$2
  
  echo "📄 $file - Tabela: $table"
  
  # Contar campos no UPDATE
  update_fields=$(grep -A 10 "UPDATE $table" "$file" | grep "SET" -A 10 | grep -E "^\s+\w+\s*=" | wc -l | tr -d ' ')
  
  # Contar campos no SELECT (schema)
  select_fields=$(grep -B 5 -A 20 "FROM $table" "$file" | grep "SELECT" -A 20 | grep -E "^\s+\w+," | wc -l | tr -d ' ')
  
  echo "   UPDATE campos: $update_fields"
  echo "   SELECT campos: $select_fields"
  
  if [ "$update_fields" -lt 5 ]; then
    echo "   ⚠️  SUSPEITO: Poucos campos sendo atualizados"
  fi
  echo ""
}

# Verificar arquivos principais
echo "🔍 VERIFICANDO ARQUIVOS PRINCIPAIS:"
echo ""

# Funcionários
if [ -f "src/worker/api/v2/funcionarios-crud.ts" ]; then
  echo "📋 funcionarios-crud.ts"
  grep -n "UPDATE funcionarios" src/worker/api/v2/funcionarios-crud.ts | head -5
  echo ""
fi

# Qualificações
if [ -f "src/worker/api/v2/qualificacoes.ts" ]; then
  echo "📋 qualificacoes.ts"
  grep -n "UPDATE qualificacoes" src/worker/api/v2/qualificacoes.ts | head -5
  echo ""
fi

# Tipos de Qualificações (já corrigido)
if [ -f "src/worker/api/tipos-qualificacoes.ts" ]; then
  echo "📋 tipos-qualificacoes.ts ✅ (já corrigido)"
  grep -n "UPDATE.*tipos_qualificacoes\|UPDATE.*catalogo_treinamentos" src/worker/api/tipos-qualificacoes.ts | head -5
  echo ""
fi

# Simuladores
if [ -f "src/worker/api/v2/simuladores.ts" ]; then
  echo "📋 simuladores.ts"
  grep -n "UPDATE simuladores" src/worker/api/v2/simuladores.ts | head -5
  echo ""
fi

# Agendamentos
if [ -f "src/worker/api/v2/agendamentos.ts" ]; then
  echo "📋 agendamentos.ts"
  grep -n "UPDATE agendamentos" src/worker/api/v2/agendamentos.ts | head -5
  echo ""
fi

# Aeronaves
if [ -f "src/worker/api/v2/aeronaves.ts" ]; then
  echo "📋 aeronaves.ts"
  grep -n "UPDATE aeronaves" src/worker/api/v2/aeronaves.ts | head -5
  echo ""
fi

# Manobras
if [ -f "src/worker/api/v2/manobras.ts" ]; then
  echo "📋 manobras.ts"
  grep -n "UPDATE manobras" src/worker/api/v2/manobras.ts | head -5
  echo ""
fi

echo ""
echo "3️⃣ PADRÕES PROBLEMÁTICOS:"
echo ""

# Procurar UPDATEs sem todos os campos
echo "⚠️  UPDATEs que podem estar faltando campos:"
grep -r "UPDATE.*SET" src/worker/api/v2 --include="*.ts" -A 3 | grep -E "WHERE.*id.*=" | head -20
echo ""

# Procurar INSERTs que podem estar incompletos
echo "⚠️  INSERTs que podem estar faltando campos:"
grep -r "INSERT INTO" src/worker/api/v2 --include="*.ts" -A 5 | grep "VALUES" | head -10
echo ""

echo "4️⃣ CAMPOS COMUNS QUE PODEM ESTAR FALTANDO:"
echo ""
echo "   ⚠️  tipo (em tabelas de qualificação/treinamento)"
echo "   ⚠️  codigo (em tabelas de qualificação/treinamento)"
echo "   ⚠️  status (em várias tabelas)"
echo "   ⚠️  updated_at (deve sempre ser atualizado)"
echo "   ⚠️  categoria (em tabelas de classificação)"
echo ""

echo "5️⃣ RECOMENDAÇÕES:"
echo ""
echo "   1. Verificar cada UPDATE manualmente"
echo "   2. Comparar campos do UPDATE com schema da tabela"
echo "   3. Garantir que todos os campos editáveis são atualizados"
echo "   4. Adicionar logging para debug"
echo "   5. Testar cada endpoint após correção"
echo ""

echo "✅ AUDITORIA CONCLUÍDA"
echo ""
echo "📝 PRÓXIMO PASSO: Revisar arquivos listados acima"
