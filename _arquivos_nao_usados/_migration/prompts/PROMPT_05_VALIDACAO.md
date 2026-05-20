# ✅ FASE 2 - PROMPT 6/7: VALIDAÇÃO COMPLETA

**Módulo**: Simuladores  
**Etapa**: Testes e validação  
**Tempo**: 1 hora  
**Dependências**: Todos os prompts anteriores

---

## 🎯 OBJETIVO

Validar que tudo funciona: build, imports, navegação e funcionalidades críticas.

---

## 📋 CHECKLIST

- [ ] Build OK
- [ ] Imports OK
- [ ] Navegação funciona
- [ ] PDF Generator funciona
- [ ] Testes funcionais essenciais

---

## 🔨 SCRIPT DE VALIDAÇÃO

```bash
#!/bin/bash
# 07-validar-completo.sh
echo "🧪 VALIDAÇÃO COMPLETA..."

# 1. Limpar caches
rm -rf node_modules/.vite dist

# 2. Build
echo "🏗️ Building..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ BUILD FALHOU!"
  exit 1
fi
echo "✅ Build OK"

# 3. Verificar imports
echo "🔍 Verificando imports..."
BROKEN=$(grep -r "from './[A-Z]" src/react-app/pages/simuladores 2>/dev/null | wc -l)

if [ $BROKEN -gt 0 ]; then
  echo "⚠️ Imports com problema:"
  grep -r "from './[A-Z]" src/react-app/pages/simuladores
else
  echo "✅ Imports OK"
fi

# 4. Verificar PDF Generator único
PDF_COUNT=$(find src -name "PDFGenerator*.tsx" | wc -l)
echo "📄 PDF Generators encontrados: $PDF_COUNT"

if [ $PDF_COUNT -eq 1 ]; then
  echo "✅ PDF Generator consolidado"
else
  echo "⚠️ Múltiplos PDF Generators ainda existem"
fi

# 5. Verificar estrutura de pastas
echo "📁 Verificando estrutura..."
EXPECTED_FOLDERS=15
ACTUAL_FOLDERS=$(find src/react-app/pages/simuladores -type d | wc -l)

echo "   Pastas esperadas: ~$EXPECTED_FOLDERS"
echo "   Pastas criadas: $ACTUAL_FOLDERS"

if [ $ACTUAL_FOLDERS -ge $EXPECTED_FOLDERS ]; then
  echo "✅ Estrutura OK"
else
  echo "⚠️ Estrutura incompleta"
fi

# 6. Verificar arquivos na raiz
ROOT_FILES=$(ls src/react-app/pages/simuladores/*.tsx 2>/dev/null | wc -l)
echo "📄 Arquivos .tsx na raiz: $ROOT_FILES"

if [ $ROOT_FILES -le 2 ]; then
  echo "✅ Raiz limpa"
else
  echo "⚠️ Ainda há arquivos na raiz:"
  ls src/react-app/pages/simuladores/*.tsx 2>/dev/null
fi

# 7. Resumo
echo ""
echo "📊 RESUMO DA VALIDAÇÃO:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Build:        $([ $? -eq 0 ] && echo '✅ OK' || echo '❌ FALHOU')"
echo " Imports:      $([ $BROKEN -eq 0 ] && echo '✅ OK' || echo '⚠️ COM PROBLEMAS')"
echo " PDF:          $([ $PDF_COUNT -eq 1 ] && echo '✅ CONSOLIDADO' || echo '⚠️ MÚLTIPLOS')"
echo " Estrutura:    $([ $ACTUAL_FOLDERS -ge $EXPECTED_FOLDERS ] && echo '✅ OK' || echo '⚠️ INCOMPLETA')"
echo " Raiz limpa:   $([ $ROOT_FILES -le 2 ] && echo '✅ SIM' || echo '⚠️ NÃO')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 8. Resultado final
if [ $? -eq 0 ] && [ $BROKEN -eq 0 ] && [ $PDF_COUNT -eq 1 ]; then
  echo ""
  echo "✅ VALIDAÇÃO COMPLETA: SUCESSO!"
  echo "📝 Próximo: PROMPT_06_FINALIZACAO.md"
  exit 0
else
  echo ""
  echo "⚠️ VALIDAÇÃO: ATENÇÃO NECESSÁRIA"
  echo "Revisar problemas antes de finalizar"
  exit 1
fi
```

---

## 🧪 TESTES FUNCIONAIS ESSENCIAIS

```bash
# Iniciar dev
npm run dev
```

Testar manualmente:

1. ✅ **Dashboard carrega**

   - Acessar `/simuladores/dashboard`
   - Verificar KPIs aparecem

2. ✅ **Lista de simuladores carrega**

   - Acessar `/simuladores/cadastros/simuladores`
   - Verificar tabela carrega

3. ✅ **Nova sessão funciona**

   - Acessar `/simuladores/sessoes/nova`
   - Verificar formulário carrega

4. ✅ **Fichas carrega**

   - Acessar `/simuladores/fichas`
   - Verificar lista aparece

5. ✅ **PDF é gerado corretamente** (CRÍTICO)
   - Abrir uma ficha
   - Clicar em "Gerar PDF"
   - Verificar PDF baixa corretamente

Documentar resultados em:

```
_migration/functional-tests-results.md
```

---

## 📝 CRIAR RELATÓRIO DE TESTES

```bash
#!/bin/bash
# 08-criar-relatorio-testes.sh
cat > _migration/functional-tests-results.md << 'EOF'
# 🧪 RESULTADOS DOS TESTES FUNCIONAIS

**Data**: $(date +%d/%m/%Y)
**Testador**: [NOME]

## Testes Executados

| # | Teste | Status | Observações |
|---|-------|--------|-------------|
| 1 | Dashboard carrega | ⏳ | |
| 2 | Lista simuladores | ⏳ | |
| 3 | Nova sessão | ⏳ | |
| 4 | Fichas lista | ⏳ | |
| 5 | PDF Generator | ⏳ | **CRÍTICO** |
| 6 | Navegação geral | ⏳ | |
| 7 | Performance | ⏳ | |

## Bugs Encontrados

(Nenhum / Listar aqui)

## Aprovação

- [ ] Todos os testes passaram
- [ ] Pronto para commit final
EOF

echo "✅ Template de testes criado: _migration/functional-tests-results.md"
echo "📝 Preencher após executar testes manuais"
```

---

## ✅ APROVAÇÃO FINAL

**Critérios para passar:**

- ✅ Build sem erros
- ✅ Imports 100% corretos
- ✅ PDF Generator único e funcional
- ✅ Estrutura completa
- ✅ Raiz limpa (≤2 arquivos)
- ✅ Testes funcionais OK

**Se todos os testes passaram:**
→ Seguir para `PROMPT_06_FINALIZACAO.md`

**Se houver problemas:**
→ Corrigir antes de finalizar

---

**Próximo**: `PROMPT_06_FINALIZACAO.md`
