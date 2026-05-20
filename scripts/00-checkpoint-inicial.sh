#!/bin/bash
# 00-checkpoint-inicial.sh
# Checkpoint inicial antes da Fase 2

set -euo pipefail

echo "🔍 CHECKPOINT INICIAL - FASE 2"
echo ""

# 1. Verificar que estamos em branch limpo
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  ATENÇÃO: Há mudanças não commitadas"
  echo "Fazer commit antes de continuar? (s/n)"
  read -r response
  if [ "$response" = "s" ]; then
    git add -A
    git commit -m "chore: checkpoint antes da Fase 2"
  fi
fi

# 2. Criar backup completo
BACKUP_DIR="_backups/fase2-inicio-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r src/react-app/pages/simuladores "$BACKUP_DIR/pages-original" 2>/dev/null || true
cp -r src/react-app/components/simuladores "$BACKUP_DIR/components-original" 2>/dev/null || true
echo "✅ Backup criado: $BACKUP_DIR"

# 3. Verificar build inicial
echo ""
echo "🏗️  Verificando build inicial..."
if npm run build > /tmp/build-inicial.log 2>&1; then
  BUILD_TIME=$(grep "built in" /tmp/build-inicial.log | grep -oE "[0-9]+\.[0-9]+s" || echo "N/A")
  echo "✅ Build inicial: OK ($BUILD_TIME)"
else
  echo "❌ Build inicial: FALHOU"
  echo "Resolver antes de continuar!"
  cat /tmp/build-inicial.log
  exit 1
fi

# 4. Criar diretório de tracking
mkdir -p _migration/logs
echo "$(date): Fase 2 iniciada" > _migration/logs/timeline.log

echo ""
echo "✅ CHECKPOINT COMPLETO!"
echo "📝 Próximo: Executar estrutura target"
