#!/bin/bash
set -euo pipefail

# Script de Limpeza Segura - Backups de Simuladores
# Data: 1 de dezembro de 2025

WORKER_ROUTES="worker-airtrust/src/routes"
BACKUP_DIR="_backups/limpeza-$(date +%Y%m%d_%H%M%S)"

echo "🧹 Iniciando limpeza de backups de simuladores..."
echo ""

# Criar backup de segurança antes de deletar
echo "📦 Criando backup de segurança em: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# 1. Backups do Worker
echo ""
echo "1️⃣  Movendo backups do worker para backup de segurança..."

FILES_TO_MOVE=(
  "$WORKER_ROUTES/simuladores.ts.backup"
  "$WORKER_ROUTES/simuladores.ts.backup-20251120_115316"
  "$WORKER_ROUTES/simuladores.ts.backup-20251201_101350"
  "$WORKER_ROUTES/simuladores.ts.bak"
  "$WORKER_ROUTES/simuladores.ts.bak2"
  "$WORKER_ROUTES/simuladores.ts.bak3"
  "$WORKER_ROUTES/simuladores.ts.bak4"
  "$WORKER_ROUTES/simuladores.ts.wrong"
  "$WORKER_ROUTES/simuladores.ts.BACKUP_ANTES_REFATORACAO_20251130"
  "$WORKER_ROUTES/simuladores.ts.pre-optimization-20251201_101038"
)

COUNT=0
for file in "${FILES_TO_MOVE[@]}"; do
  if [ -f "$file" ]; then
    cp "$file" "$BACKUP_DIR/"
    rm "$file"
    COUNT=$((COUNT + 1))
    echo "  ✅ Deletado: $(basename "$file")"
  fi
done

echo ""
echo "📊 Total de backups removidos: $COUNT"

# Calcular espaço liberado
if [ $COUNT -gt 0 ]; then
  SPACE_SAVED=$(du -sh "$BACKUP_DIR" | cut -f1)
  echo "💾 Espaço liberado: ~$SPACE_SAVED"
fi

echo ""
echo "✅ Limpeza concluída!"
echo ""
echo "📝 Backup de segurança salvo em: $BACKUP_DIR"
echo "   (pode ser deletado após 7 dias de testes)"
echo ""
echo "🔍 Para verificar:"
echo "   ls -lh $WORKER_ROUTES/simuladores.ts*"
