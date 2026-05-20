# 📄 FASE 2 - PROMPT 4/7: CONSOLIDAÇÃO PDF GENERATOR

**Módulo**: Simuladores  
**Etapa**: Consolidar 3 versões de PDF em 1  
**Tempo**: 1 hora  
**Dependências**: Nenhuma (pode rodar em paralelo)

---

## 🎯 OBJETIVO

Consolidar PDFGeneratorNativo, PDFGeneratorDefinitivo e PDFGeneratorRobusto em um único componente confiável.

---

## 📋 CHECKLIST

- [ ] Comparar 3 versões
- [ ] Escolher versão a manter
- [ ] Consolidar em 1 arquivo
- [ ] Atualizar imports
- [ ] Testar geração de PDF
- [ ] Deletar versões antigas

---

## 🔨 SCRIPT DE COMPARAÇÃO

```bash
#!/bin/bash
# 05-comparar-pdf.sh
echo "🔍 COMPARANDO PDF GENERATORS..."

BASE="src/react-app/components/simuladores"

echo ""
echo "| Versão | Linhas | Usos |"
echo "|--------|--------|------|"

for pdf in PDFGeneratorDefinitivo.tsx PDFGeneratorNativo.tsx PDFGeneratorRobusto.tsx; do
  if [ -f "$BASE/$pdf" ]; then
    lines=$(wc -l < "$BASE/$pdf")
    uses=$(grep -r "import.*${pdf%.tsx}" src/react-app --include="*.tsx" 2>/dev/null | wc -l)
    echo "| $pdf | $lines | $uses |"
  fi
done

echo ""
echo "📊 RECOMENDAÇÃO: Manter versão com mais usos"
```

---

## 🔧 SCRIPT DE CONSOLIDAÇÃO

```bash
#!/bin/bash
# 06-consolidar-pdf.sh
echo "🔧 CONSOLIDANDO PDF GENERATORS..."

BASE_SRC="src/react-app/components/simuladores"
BASE_DEST="src/react-app/pages/simuladores/components"

# 1. Copiar versão escolhida (PDFGeneratorNativo)
cp "$BASE_SRC/PDFGeneratorNativo.tsx" "$BASE_DEST/PDFGenerator.tsx"
echo "✅ PDFGenerator.tsx criado"

# 2. Atualizar imports
find src/react-app -type f -name "*.tsx" -exec sed -i.bak \
  -e 's|PDFGeneratorNativo|PDFGenerator|g' \
  -e 's|PDFGeneratorDefinitivo|PDFGenerator|g' \
  -e 's|PDFGeneratorRobusto|PDFGenerator|g' \
  {} \;

# 3. Atualizar paths
find src/react-app -type f -name "*.tsx" -exec sed -i.bak2 \
  -e 's|@/components/simuladores/PDFGenerator|@/pages/simuladores/components/PDFGenerator|g' \
  {} \;

# Limpar backups
find src/react-app -name "*.bak*" -delete

echo "✅ Imports atualizados"

# 4. Build test
npm run build

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ BUILD OK - Pode deletar versões antigas:"
  echo "   rm $BASE_SRC/PDFGeneratorDefinitivo.tsx"
  echo "   rm $BASE_SRC/PDFGeneratorRobusto.tsx"
  echo "   rm $BASE_SRC/PDFGeneratorNativo.tsx"
else
  echo "❌ BUILD FALHOU - NÃO deletar nada ainda"
  exit 1
fi
```

---

## ✅ VALIDAÇÃO

```bash
# 1. Build passou
npm run build

# 2. Testar geração de PDF manualmente
npm run dev
# Navegar para ficha e gerar PDF

# 3. Se OK, deletar versões antigas
rm src/react-app/components/simuladores/PDFGenerator*.tsx
```

---

**Próximo**: `PROMPT_04_ROTAS.md`
