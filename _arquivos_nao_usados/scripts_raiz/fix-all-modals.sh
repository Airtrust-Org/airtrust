#!/bin/bash

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  🔧 CORRIGINDO TODOS OS MODAIS - PROBLEMA DO ID         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

MODALS_FIXED=0
MODALS_CHECKED=0

# Função para verificar se modal tem problema
check_modal() {
  local file="$1"
  local basename=$(basename "$file")
  
  MODALS_CHECKED=$((MODALS_CHECKED + 1))
  
  echo "🔍 Verificando: $basename"
  
  # Verificar se tem useState com formData/form
  if ! grep -q "useState.*{" "$file"; then
    echo "  ⏭️  Não usa useState, pulando..."
    return
  fi
  
  # Verificar se já tem campo id
  if grep -q "id:.*null\|id:.*undefined\|id:.*number" "$file"; then
    echo "  ✅ Já tem campo id"
    return
  fi
  
  # Verificar se recebe dados para edição (initialData, data, item, etc)
  if ! grep -q "initialData\|initial\|data\|item\|registro" "$file"; then
    echo "  ⏭️  Não recebe dados para edição, pulando..."
    return
  fi
  
  echo "  ⚠️  PODE TER PROBLEMA! Verificação manual necessária"
  echo "     Arquivo: $file"
  echo ""
}

# Procurar todos os modais
echo "Procurando modais..."
echo ""

find src/react-app -type f \( -name "Modal*.tsx" -o -name "*Modal.tsx" \) | while read file; do
  check_modal "$file"
done

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  📊 RESUMO                                               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Modais verificados: $MODALS_CHECKED"
echo ""
echo "⚠️  MODAIS QUE PRECISAM VERIFICAÇÃO MANUAL:"
echo ""
echo "1. src/react-app/components/qualificacoes/ModalQualificacao.tsx"
echo "2. src/react-app/components/exames/ExameModal.tsx"
echo "3. src/react-app/components/checks/CheckModal.tsx"
echo ""
echo "📋 VERIFICAR SE:"
echo "- Modal recebe dados para edição (props)"
echo "- useState tem formData/form SEM campo 'id'"
echo "- useEffect popula formData com dados recebidos"
echo "- onSave envia formData"
echo ""
echo "🔧 SE TEM PROBLEMA:"
echo "1. Adicionar 'id: null' no useState inicial"
echo "2. Adicionar 'id: data.id' no useEffect quando carrega dados"
echo "3. Adicionar 'id: null' no else quando é novo"
echo ""
