#!/bin/bash
set -euo pipefail

# Script para Deletar Componentes Obsoletos de Simuladores
# Data: 1 de dezembro de 2025

COMPONENT_DIR="src/react-app/components/simuladores"
BACKUP_DIR="_backups/componentes-obsoletos-$(date +%Y%m%d_%H%M%S)"

echo "🗑️  Deletando componentes obsoletos de simuladores..."
echo ""

# Criar backup de segurança
echo "📦 Criando backup em: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Lista de componentes não usados (da auditoria)
COMPONENTS_TO_DELETE=(
  "AssinaturaDigitalModal.tsx"
  "BotoesAcaoFicha.tsx"
  "BotoesAcaoFichaFinal.tsx"
  "CadastrosUnificados.tsx"
  "CalendarioAgendamentos.tsx"
  "EditSlotModal.tsx"
  "FichaAvaliacao.tsx"
  "FichaOpenModal.tsx"
  "FichaVisualizacaoAprimorada.tsx"
  "FormularioCategoria.tsx"
  "FormularioCriarTemplate.tsx"
  "FormularioManobra.tsx"
  "FormularioTemplate.tsx"
  "FormularioTemplate.css"
  "ImportarManobras.tsx"
  "ListagemFichasSimulador.tsx"
  "MatrizConfigModal.tsx"
  "ModalAssinarFicha.tsx"
  "ModalAssinaturaCanvas.tsx"
  "ModalConfigurarManobras.tsx"
  "ModalPreencherFicha.tsx"
  "PDFGeneratorCompacto.tsx"
  "ProgressoIndividualModal.tsx"
  "ProgressoTreinamento.tsx"
  "ProgressoTreinamentoAirtrust.tsx"
  "SeletorTreinamentoAirtrust.tsx"
  "SessionModal.tsx"
  "VisualizarFichaSimulador.tsx"
)

COUNT=0
for component in "${COMPONENTS_TO_DELETE[@]}"; do
  file="$COMPONENT_DIR/$component"
  if [ -f "$file" ]; then
    cp "$file" "$BACKUP_DIR/"
    rm "$file"
    COUNT=$((COUNT + 1))
    echo "  ✅ Deletado: $component"
  else
    echo "  ⚠️  Não encontrado: $component"
  fi
done

echo ""
echo "📊 Total de componentes deletados: $COUNT"

if [ $COUNT -gt 0 ]; then
  SPACE_SAVED=$(du -sh "$BACKUP_DIR" | cut -f1)
  echo "💾 Espaço liberado: ~$SPACE_SAVED"
fi

echo ""
echo "✅ Limpeza de componentes concluída!"
echo ""
echo "📝 Backup salvo em: $BACKUP_DIR"
echo "   (pode ser deletado após 7 dias de testes)"
echo ""
echo "🔍 Para verificar componentes restantes:"
echo "   ls -1 $COMPONENT_DIR/*.tsx | wc -l"
