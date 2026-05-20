#!/usr/bin/env bash
set -euo pipefail

# Script limpo: importa dados de produção removendo referências a tabelas que não existem

echo "🚀 Sync Produção -> Local (LIMPO)"

BACKUP_DIR="./backups"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
EXPORT_FILE="$BACKUP_DIR/production-export-$TIMESTAMP.sql"
CLEAN_FILE="$BACKUP_DIR/production-export-$TIMESTAMP-clean.sql"

WORKER_DIR="worker-airtrust"
STATE_ROOT="$WORKER_DIR/.wrangler/state/v3/d1"
TARGET_DIR="$STATE_ROOT/airtrust-local-fixed.sqlite"

# 1. Export remoto completo
echo "📦 Exportando dados de produção..."
cd "$WORKER_DIR"
npx wrangler d1 export airtrust-db --remote > "../$EXPORT_FILE" 2>&1
cd ..

if [ ! -f "$EXPORT_FILE" ] || [ ! -s "$EXPORT_FILE" ]; then
  echo "❌ Export falhou. Tentando método alternativo..."
  exit 1
fi

echo "✅ Export recebido: $EXPORT_FILE ($(du -h "$EXPORT_FILE" | cut -f1))"

# 2. Limpar referências órfãs
echo "🧹 Removendo referências a tabelas faltantes..."
python3 - <<PYTHON
import re
with open('$EXPORT_FILE', 'r') as f:
    content = f.read()

# Remover referências a __backup_pessoas (tabela não existe)
# Pattern: FOREIGN KEY ... REFERENCES "__backup_pessoas"
content = re.sub(
    r',\s*FOREIGN KEY \([^)]+\) REFERENCES "__backup_pessoas"\([^)]+\)(?:\s+ON DELETE[^,]*)?',
    '',
    content,
    flags=re.IGNORECASE
)

# Remover CREATE TABLE __backup_* se existir
content = re.sub(
    r'CREATE TABLE.*?"__backup_[^"]+"\s*\([^)]*\);',
    '',
    content,
    flags=re.IGNORECASE | re.DOTALL
)

with open('$CLEAN_FILE', 'w') as f:
    f.write(content)
PYTHON

echo "✅ Arquivo limpo: $CLEAN_FILE"

# 3. Limpar estado D1 local
echo "🧹 Limpando estado D1 local..."
rm -rf "$STATE_ROOT" 2>/dev/null || true
mkdir -p "$TARGET_DIR"

# 4. Importar dump limpo
echo "📥 Importando dump limpo no banco local..."
cd "$WORKER_DIR"
cat "../$CLEAN_FILE" | npx wrangler d1 execute airtrust-db --local --file - 2>&1 | tail -20

echo "✅ Import concluído!"

# 5. Verificar tabelas críticas
echo ""
echo "🔍 Validando tabelas importadas:"
npx wrangler d1 execute airtrust-db --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name LIMIT 20;" | grep -E "certificados|qualificacoes|funcionarios" || echo "⚠️ Nenhuma tabela crítica encontrada"

echo ""
echo "📊 Contagem de registros:"
npx wrangler d1 execute airtrust-db --local --command "SELECT 'certificados' as tabla, COUNT(*) as total FROM certificados WHERE deleted_at IS NULL" 2>/dev/null || echo "⚠️ certificados vazio/não existe"
npx wrangler d1 execute airtrust-db --local --command "SELECT 'qualificacoes_categorias' as tabla, COUNT(*) as total FROM qualificacoes_categorias WHERE deleted_at IS NULL" 2>/dev/null || echo "⚠️ qualificacoes_categorias vazio/não existe"

echo ""
echo "🎉 Sync completo! Dados de produção importados localmente."
echo "   Reinicie o worker para refletir as mudanças."
