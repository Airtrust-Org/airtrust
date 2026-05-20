#!/bin/bash

# Correção automática de nomes de colunas para usar produção
# Data: 2025-11-20

FILE="worker-airtrust/src/routes/simuladores.ts"

echo "🔧 Corrigindo nomes de colunas em $FILE..."

# Backup
cp "$FILE" "${FILE}.backup-$(date +%Y%m%d_%H%M%S)"

# Correções principais:
# 1. fichas_sessao: sessao_id -> agendamento_slot_id
# 2. fichas_sessao: funcionario_id -> colaborador_id_aluno  
# 3. simulador_agendamentos: data_sessao -> data

# Substituir TODAS as ocorrências de fichas_sessao.sessao_id
sed -i '' 's/f\.sessao_id/f.agendamento_slot_id/g' "$FILE"
sed -i '' 's/fs\.sessao_id/fs.agendamento_slot_id/g' "$FILE"
sed -i '' 's/FROM fichas_sessao WHERE sessao_id/FROM fichas_sessao WHERE agendamento_slot_id/g' "$FILE"
sed -i '' 's/(sessao_id, funcionario_id/(agendamento_slot_id, colaborador_id_aluno/g' "$FILE"

# Substituir fichas_sessao.funcionario_id (SOMENTE em contexto de fichas_sessao)
sed -i '' 's/f\.funcionario_id/f.colaborador_id_aluno/g' "$FILE"
sed -i '' 's/fs\.funcionario_id/fs.colaborador_id_aluno/g' "$FILE"

# Substituir simulador_agendamentos.data_sessao -> data
sed -i '' 's/s\.data_sessao/s.data/g' "$FILE"
sed -i '' 's/data_sessao: string/data: string/g' "$FILE"

# TypeScript types em interfaces
sed -i '' 's/tipo_sessao: string; tipo_aeronave\?: string; data_sessao: string/tipo_sessao: string; tipo_aeronave?: string; data: string/g' "$FILE"
sed -i '' 's/data_sessao: string; tipo_sessao: string/data: string; tipo_sessao: string/g' "$FILE"
sed -i '' 's/sessao_id: number/agendamento_slot_id: number/g' "$FILE"

# Comentários
sed -i '' 's/Schema legado usa data_sessao/Schema de produção usa data (não data_sessao)/g' "$FILE"

echo "✅ Correções aplicadas!"
echo ""
echo "📊 Resumo das mudanças:"
echo "  - fichas_sessao.sessao_id → agendamento_slot_id"
echo "  - fichas_sessao.funcionario_id → colaborador_id_aluno"
echo "  - simulador_agendamentos.data_sessao → data"
echo ""
echo "🔍 Verificando se ainda há referências incorretas..."

# Verificar se ainda há usos incorretos
REMAINING_DATA_SESSAO=$(grep -c "\.data_sessao" "$FILE" || true)
REMAINING_SESSAO_ID=$(grep -c "\.sessao_id" "$FILE" || true)

echo "  - Referências a .data_sessao: $REMAINING_DATA_SESSAO"
echo "  - Referências a .sessao_id: $REMAINING_SESSAO_ID"

if [ "$REMAINING_DATA_SESSAO" -gt 0 ] || [ "$REMAINING_SESSAO_ID" -gt 0 ]; then
  echo ""
  echo "⚠️  Ainda há referências que precisam de correção manual:"
  grep -n "\.data_sessao\|\.sessao_id" "$FILE" || true
fi

echo ""
echo "✅ Script concluído!"
