#!/bin/bash
# consolidate-pdf-generator.sh
# Consolida 3 versões de PDF Generator em 1 única versão

set -euo pipefail

# Uso: ./consolidate-pdf-generator.sh <versao-escolhida>
# Exemplo: ./consolidate-pdf-generator.sh PDFGeneratorNativo.tsx

if [ $# -ne 1 ]; then
  echo "❌ Uso: ./consolidate-pdf-generator.sh <versao-escolhida>"
  echo ""
  echo "Opções:"
  echo "  PDFGeneratorDefinitivo.tsx"
  echo "  PDFGeneratorNativo.tsx"
  echo "  PDFGeneratorRobusto.tsx"
  echo ""
  echo "Exemplo:"
  echo "  ./consolidate-pdf-generator.sh PDFGeneratorNativo.tsx"
  exit 1
fi

KEEP="$1"
BASE="src/react-app/components/simuladores"
KEEP_PATH="$BASE/$KEEP"

# Validar que arquivo escolhido existe
if [ ! -f "$KEEP_PATH" ]; then
  echo "❌ Arquivo não encontrado: $KEEP_PATH"
  exit 1
fi

echo "🔧 CONSOLIDANDO PDF GENERATORS..."
echo "   Mantendo: $KEEP"
echo ""

# Definir quais deletar
ALL_PDFs=(
  "PDFGeneratorDefinitivo.tsx"
  "PDFGeneratorNativo.tsx"
  "PDFGeneratorRobusto.tsx"
)

DELETE=()
for pdf in "${ALL_PDFs[@]}"; do
  if [ "$pdf" != "$KEEP" ]; then
    DELETE+=("$pdf")
  fi
done

echo "📋 Versões a DELETAR:"
for pdf in "${DELETE[@]}"; do
  echo "   ❌ $pdf"
done
echo ""

read -p "❓ Continuar com a consolidação? (Y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Nn]$ ]]; then
  echo "❌ Operação cancelada"
  exit 1
fi

# 1. Criar backup
BACKUP_DIR="_backups/pdf-generators-consolidacao-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "🗄️  Criando backup..."
for pdf in "${ALL_PDFs[@]}"; do
  if [ -f "$BASE/$pdf" ]; then
    cp "$BASE/$pdf" "$BACKUP_DIR/"
  fi
done
echo "✅ Backup salvo em: $BACKUP_DIR"
echo ""

# 2. Copiar versão escolhida para components/ com nome padrão
DEST="src/react-app/pages/simuladores/components/PDFGenerator.tsx"
mkdir -p "$(dirname "$DEST")"
cp "$KEEP_PATH" "$DEST"

# Atualizar nome do export no arquivo
KEEP_NAME="${KEEP%.tsx}"
sed -i.bak "s/export.*function $KEEP_NAME/export function PDFGenerator/g" "$DEST"
sed -i.bak "s/export default $KEEP_NAME/export default PDFGenerator/g" "$DEST"
rm "${DEST}.bak" 2>/dev/null || true

echo "✅ PDFGenerator.tsx criado em: $DEST"
echo "   Baseado em: $KEEP"
echo ""

# 3. Listar arquivos que importam versões antigas
echo "🔍 ARQUIVOS QUE PRECISAM ATUALIZAR IMPORTS:"
echo ""

for pdf in "${DELETE[@]}"; do
  name="${pdf%.tsx}"
  imports=$(grep -r "import.*$name" src/react-app --include="*.tsx" --include="*.ts" 2>/dev/null || true)
  
  if [ -n "$imports" ]; then
    echo "📦 Imports de $pdf:"
    echo "$imports" | while read line; do
      file=$(echo "$line" | cut -d: -f1)
      echo "   - $file"
    done
    echo ""
  fi
done

# Também listar imports da versão mantida
KEEP_NAME="${KEEP%.tsx}"
keep_imports=$(grep -r "import.*$KEEP_NAME" src/react-app --include="*.tsx" --include="*.ts" 2>/dev/null || true)

if [ -n "$keep_imports" ]; then
  echo "📦 Imports de $KEEP (também precisa atualizar):"
  echo "$keep_imports" | while read line; do
    file=$(echo "$line" | cut -d: -f1)
    echo "   - $file"
  done
  echo ""
fi

echo "📝 PRÓXIMOS PASSOS MANUAIS:"
echo ""
echo "1️⃣  ATUALIZAR IMPORTS"
echo "    Em cada arquivo listado acima, trocar:"
echo "    - import { PDFGeneratorDefinitivo } from '...' ❌"
echo "    - import { PDFGeneratorNativo } from '...' ❌"
echo "    - import { PDFGeneratorRobusto } from '...' ❌"
echo "    Para:"
echo "    - import { PDFGenerator } from '@/pages/simuladores/components' ✅"
echo ""
echo "2️⃣  ATUALIZAR USO NOS COMPONENTES"
echo "    Trocar:"
echo "    - <PDFGeneratorDefinitivo ... /> ❌"
echo "    - <PDFGeneratorNativo ... /> ❌"
echo "    - <PDFGeneratorRobusto ... /> ❌"
echo "    Para:"
echo "    - <PDFGenerator ... /> ✅"
echo ""
echo "3️⃣  TESTAR GERAÇÃO DE PDF"
echo "    npm run dev"
echo "    Navegar para ficha e testar PDF"
echo ""
echo "4️⃣  SE TUDO OK, DELETAR VERSÕES ANTIGAS"
for pdf in "${DELETE[@]}"; do
  echo "    rm $BASE/$pdf"
done
echo "    rm $BASE/$KEEP  # (versão original, agora duplicada)"
echo ""
echo "5️⃣  BUILD E VALIDAÇÃO"
echo "    npm run build"
echo "    ./scripts/check-imports-pos-limpeza.sh"
echo ""
echo "6️⃣  COMMIT"
echo "    git add -- <arquivos revisados>"
echo "    git commit -m \"refactor(simuladores): consolidate PDF generators into single version\""
echo ""

# 4. Criar arquivo de documentação
cat > "_migration/pdf-consolidation.md" << EOF
# 📄 CONSOLIDAÇÃO PDF GENERATORS

**Data**: $(date +"%d/%m/%Y %H:%M")
**Versão Mantida**: $KEEP
**Versões Deletadas**: ${DELETE[*]}

---

## ✅ AÇÕES EXECUTADAS

1. ✅ Backup criado: $BACKUP_DIR
2. ✅ PDFGenerator.tsx criado em: $DEST
3. ⏳ Imports pendentes de atualização (ver lista acima)

---

## 📋 CHECKLIST

- [ ] Imports atualizados
- [ ] Uso nos componentes atualizado
- [ ] PDF testado e funcionando
- [ ] Versões antigas deletadas
- [ ] Build passando
- [ ] Commit realizado

---

## 🔄 ROLLBACK

Se necessário, restaurar backups:

\`\`\`bash
cp $BACKUP_DIR/* $BASE/
\`\`\`
EOF

echo "📄 Documentação criada: _migration/pdf-consolidation.md"
echo ""
echo "✅ Consolidação preparada! Execute os passos manuais acima."
