#!/usr/bin/env bash
set -euo pipefail

# Import rápido: usa o último export existente

echo "🚀 Import Produção -> Local (Rápido)"

LATEST_EXPORT=$(ls -t "/Users/filipedaumas/Documents/airtrust v1/backups"/production-export-*.sql 2>/dev/null | grep -v processed | grep -v tmp | head -1)

if [ -z "$LATEST_EXPORT" ]; then
  echo "❌ Nenhum arquivo de export encontrado"
  exit 1
fi

echo "📦 Usando export: $LATEST_EXPORT ($(du -h "$LATEST_EXPORT" | cut -f1))"

CLEAN_FILE="${LATEST_EXPORT%.*}-clean-$(date +%s).sql"

# Limpar referências órfãs
echo "🧹 Removendo referências a tabelas faltantes..."
python3 "$LATEST_EXPORT" "$CLEAN_FILE" << 'PYTHON'
import re
import sys

export_file = sys.argv[1]
clean_file = sys.argv[2]

with open(export_file, 'r') as f:
    content = f.read()

# Remover FOREIGN KEYs referenciando __backup_pessoas
content = re.sub(
    r',\s*FOREIGN KEY \([^)]+\) REFERENCES "__backup_pessoas"\([^)]+\)(?:\s+ON[^,]*)*',
    '',
    content,
    flags=re.IGNORECASE
)

# Remover FOREIGN KEYs referenciando __backup_* em geral
content = re.sub(
    r',\s*FOREIGN KEY \([^)]+\) REFERENCES "__backup_[^"]*"\([^)]+\)(?:\s+ON[^,]*)*',
    '',
    content,
    flags=re.IGNORECASE
)

# Remover CREATE TABLE __backup_* se não pode referenciar
content = re.sub(
    r'^CREATE TABLE\s+"?__backup_[^;]*?;$',
    '',
    content,
    flags=re.IGNORECASE | re.MULTILINE
)

with open(clean_file, 'w') as f:
    f.write(content)

print(f"✅ Arquivo limpo: {clean_file}")
PYTHON

# Limpar estado D1 local
echo "🧹 Limpando estado D1 local..."
WORKER_DIR="worker-airtrust"
STATE_ROOT="$WORKER_DIR/.wrangler/state/v3/d1"
rm -rf "$STATE_ROOT" 2>/dev/null || true
mkdir -p "$STATE_ROOT/airtrust-local-fixed.sqlite"

# Importar dump limpo
echo "📥 Importando dump no banco local..."
cd "$WORKER_DIR"
cat "../$CLEAN_FILE" | npx wrangler d1 execute airtrust-db --local --file - 2>&1 | tail -30
cd ..

echo ""
echo "✅ Import concluído!"

# Verificar tabelas
echo "🔍 Validando tabelas:"
cd "$WORKER_DIR"
npx wrangler d1 execute airtrust-db --local --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('certificados','qualificacoes_categorias','qualificacoes_tipos','qualificacoes_historico','funcionarios') ORDER BY name;" 2>/dev/null | python3 -c "
import json, sys
try:
    j = json.load(sys.stdin)
    tables = [r['name'] for r in j[0]['results']]
    for t in tables:
        print(f'  ✓ {t}')
except:
    print('  (Verificação falhou)')
" || echo "  (Sem resposta)"
cd ..

echo ""
echo "📊 Contagem de registros:"
cd "$WORKER_DIR"
for T in certificados qualificacoes_categorias qualificacoes_tipos qualificacoes_historico funcionarios; do
  COUNT=$(npx wrangler d1 execute airtrust-db --local --json --command "SELECT COUNT(*) as c FROM $T WHERE deleted_at IS NULL" 2>/dev/null | python3 -c "import json,sys; j=json.load(sys.stdin); print(j[0]['results'][0]['c'])" 2>/dev/null || echo "?")
  echo "  $T: $COUNT registros"
done
cd ..

echo ""
echo "🎉 Sync completo! Dados de produção importados."
echo "   Recarregue a página do navegador (Ctrl+Shift+R)"
