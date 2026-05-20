# 📋 DIA 3: VALIDAÇÃO FRONTEND COMPLETA - GUIA DE USO

**Data**: 30/11/2025  
**Status**: ✅ PRONTO PARA EXECUÇÃO

---

## 🎯 VISÃO GERAL

Este guia contém 3 ferramentas para validação completa do frontend após refatoração:

1. **checklist-frontend-validation.md** - Checklist manual interativo (111 itens)
2. **analyze-bundle.sh** - Análise automatizada do bundle de produção
3. **lighthouse-audit.sh** - Auditoria Lighthouse de 6 páginas principais

---

## 📝 FERRAMENTA 1: CHECKLIST MANUAL

### Como usar:

```bash
# 1. Abra o arquivo
open checklist-frontend-validation.md

# 2. Inicie o dev server
npm run dev:web

# 3. Abra o navegador
# http://localhost:3000

# 4. Abra React Query DevTools
# (canto inferior da tela)

# 5. Abra Chrome DevTools
# F12 ou Cmd+Option+I

# 6. Navegue e teste cada item
# Marque: ✅ (ok), ⚠️ (ressalva), ❌ (erro)
```

### Seções do Checklist:

- 1️⃣ Login e Autenticação (5 itens)
- 2️⃣ Funcionários (18 itens)
- 3️⃣ Qualificações (21 itens)
- 4️⃣ Certificados (17 itens)
- 5️⃣ Simuladores (13 itens)
- 6️⃣ Pasta Virtual (10 itens)
- 7️⃣ Compliance (5 itens)
- 8️⃣ Auditoria (5 itens)
- 9️⃣ Performance Geral (8 itens)
- 🔟 React Query DevTools (5 itens)

**Total**: 111 itens

### Critérios de Aprovação:

- ✅ **>95%**: Sistema estável - APROVAR
- ⚠️ **85-95%**: OK com ressalvas - CORRIGIR e APROVAR
- ❌ **<85%**: Problemas críticos - CORRIGIR antes de aprovar

---

## 📦 FERRAMENTA 2: ANÁLISE DE BUNDLE

### Como executar:

```bash
# Executar análise
./analyze-bundle.sh

# Salvar output em arquivo
./analyze-bundle.sh > reports/bundle-analysis-$(date +%Y%m%d).txt
```

### O que analisa:

1. ✅ Executa `npm run build`
2. ✅ Lista maiores arquivos (top 20)
3. ✅ Resumo por tipo (JS, CSS, Assets)
4. ✅ Tamanho total do bundle
5. ✅ Simulação de Gzip para JS e CSS
6. ✅ Identifica chunks > 500KB
7. ✅ Lista top 10 arquivos JS
8. ✅ Analisa vendor chunks
9. ✅ Contagem de arquivos
10. ✅ Recomendações automatizadas

### Métricas Esperadas:

- 📦 **Bundle total**: < 2 MB (ideal)
- 📄 **JS total**: < 1.5 MB (ideal)
- 🎨 **CSS total**: < 200 KB (ideal)
- 🗜️ **Gzip ratio**: 25-35% (ideal)
- ⚠️ **Chunks > 500KB**: 0 (ideal)

---

## 🏠 FERRAMENTA 3: LIGHTHOUSE AUDIT

### Pré-requisitos:

```bash
# Instalar Lighthouse (se necessário)
npm install -g lighthouse

# Instalar jq para parsear JSON (macOS)
brew install jq

# Ou executar via npx (sem instalação)
# O script detecta automaticamente
```

### Como executar:

```bash
# 1. Certifique-se de que o dev server está rodando
npm run dev:web

# 2. Em outro terminal, execute
./lighthouse-audit.sh

# 3. Aguarde ~5-10 minutos (depende da máquina)
# 6 páginas serão testadas

# 4. Relatórios serão salvos em:
# reports/lighthouse/*.report.html
# reports/lighthouse/*.report.json
```

### Páginas testadas:

1. Home (/)
2. Funcionários (/funcionarios)
3. Qualificações (/qualificacoes)
4. Simuladores (/simuladores)
5. Compliance (/compliance)
6. Auditoria (/auditoria)

### Métricas Lighthouse:

Para cada página:

- 📊 **Performance** (0-100)
- ♿ **Accessibility** (0-100)
- ✅ **Best Practices** (0-100)
- 🔍 **SEO** (0-100)

### Scores Esperados:

- ✅ **≥90**: Excelente
- ✅ **80-89**: Bom
- ⚠️ **50-79**: Aceitável
- ❌ **<50**: Ruim - requer atenção

### Visualizar Relatórios:

```bash
# macOS
open reports/lighthouse/*.report.html

# Linux
xdg-open reports/lighthouse/*.report.html

# Ou abra manualmente no navegador
# reports/lighthouse/home.report.html
# reports/lighthouse/funcionarios.report.html
# etc.
```

---

## 🚀 FLUXO DE EXECUÇÃO COMPLETO

### Passo a Passo:

```bash
# 1. CHECKLIST MANUAL (30-60 minutos)
npm run dev:web
# Preencha checklist-frontend-validation.md

# 2. ANÁLISE DE BUNDLE (2-5 minutos)
./analyze-bundle.sh > reports/bundle-analysis-$(date +%Y%m%d).txt

# 3. LIGHTHOUSE AUDIT (5-10 minutos)
./lighthouse-audit.sh
```

**Tempo Total Estimado**: 40-75 minutos

---

## 📊 TEMPLATE DE RELATÓRIO FINAL

Após executar todas as ferramentas, preencha:

```
═══════════════════════════════════════════
RELATÓRIO DIA 3 - VALIDAÇÃO FRONTEND
═══════════════════════════════════════════

**Data**: ___/___/2025
**Testador**: _________________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 1. CHECKLIST MANUAL

Total de itens: 111
✅ Funcionando perfeitamente: ___
⚠️ Funcionando com ressalvas: ___
❌ Não funcionando: ___

**Taxa de sucesso**: ___%

**Principais problemas**:
1. _______________________________________
2. _______________________________________
3. _______________________________________

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 2. BUNDLE ANALYSIS

Bundle total: ___ KB
JS total: ___ KB
CSS total: ___ KB
Gzip JS: ___ KB
Gzip CSS: ___ KB
Chunks > 500KB: ___ (listar se houver)

**Recomendações**:
[ ] Bundle está otimizado
[ ] Requer code splitting
[ ] Requer lazy loading

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 3. LIGHTHOUSE SCORES

**Página Home**:
- Performance: ___/100
- Accessibility: ___/100
- Best Practices: ___/100
- SEO: ___/100

**Página Funcionários**:
- Performance: ___/100
- Accessibility: ___/100
- Best Practices: ___/100
- SEO: ___/100

**Página Qualificações**:
- Performance: ___/100
- Accessibility: ___/100
- Best Practices: ___/100
- SEO: ___/100

**Página Simuladores**:
- Performance: ___/100
- Accessibility: ___/100
- Best Practices: ___/100
- SEO: ___/100

**Página Compliance**:
- Performance: ___/100
- Accessibility: ___/100
- Best Practices: ___/100
- SEO: ___/100

**Página Auditoria**:
- Performance: ___/100
- Accessibility: ___/100
- Best Practices: ___/100
- SEO: ___/100

**Média Geral Performance**: ___/100

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 4. REACT QUERY DEVTOOLS

Queries com fetchCount > 5: ___ (listar)
Cache funcionando? (Sim/Não): ___
Refetch excessivo detectado? (Sim/Não): ___

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 5. PERFORMANCE PERCEBIDA

Sistema mais rápido que antes? (Sim/Não/Igual): ___
Páginas carregam em < 3s? (Sim/Não): ___
Scroll fluido? (Sim/Não): ___
Sem "piscadas" ou re-renders? (Sim/Não): ___

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## 6. DECISÃO FINAL

[ ] ✅ Frontend validado - Taxa >95% - PROSSEGUIR DIA 4
[ ] ⚠️ Frontend OK com ressalvas - Taxa 85-95% - CORRIGIR e PROSSEGUIR
[ ] ❌ Problemas críticos - Taxa <85% - CORRIGIR antes de DIA 4

**Observações**:
_________________________________________
_________________________________________
_________________________________________

═══════════════════════════════════════════
```

---

## 🔍 TROUBLESHOOTING

### Problema: "npm run build falha"

```bash
# Limpar cache
rm -rf dist node_modules/.vite .vite

# Reinstalar dependências
npm install

# Tentar novamente
npm run build
```

### Problema: "Lighthouse não encontrado"

```bash
# Opção 1: Instalar globalmente
npm install -g lighthouse

# Opção 2: Executar via npx
npx lighthouse http://localhost:3000 --output html --output-path=./report.html
```

### Problema: "localhost:3000 não responde"

```bash
# Verificar se porta está ocupada
lsof -ti:3000

# Matar processo
kill -9 $(lsof -ti:3000)

# Reiniciar dev server
npm run dev:web
```

### Problema: "jq não encontrado"

```bash
# macOS
brew install jq

# Linux (Debian/Ubuntu)
sudo apt-get install jq

# Sem jq, Lighthouse ainda funciona, só não mostra scores no terminal
```

---

## ✅ CHECKLIST DE EXECUÇÃO

Antes de começar:

- [ ] Dev server rodando (`npm run dev:web`)
- [ ] React Query DevTools visível
- [ ] Chrome DevTools aberto
- [ ] checklist-frontend-validation.md aberto
- [ ] analyze-bundle.sh executável (`chmod +x`)
- [ ] lighthouse-audit.sh executável (`chmod +x`)
- [ ] Diretório `reports/` existe

Durante execução:

- [ ] Checklist manual preenchido (111 itens)
- [ ] Bundle analysis executado
- [ ] Lighthouse audit executado (6 páginas)
- [ ] Relatórios HTML visualizados
- [ ] Screenshots de problemas (se houver)

Após execução:

- [ ] Relatório final preenchido
- [ ] Taxa de sucesso calculada
- [ ] Decisão tomada (aprovar/corrigir/rejeitar)
- [ ] Problemas documentados
- [ ] Próximos passos definidos

---

## 📌 PRÓXIMOS PASSOS

**Se Taxa >95%**:
✅ Frontend validado  
→ Prosseguir para **DIA 4** (TBD)

**Se Taxa 85-95%**:
⚠️ Corrigir pequenos problemas  
→ Re-testar itens falhados  
→ Prosseguir para **DIA 4**

**Se Taxa <85%**:
❌ Corrigir problemas críticos  
→ Re-executar validação completa  
→ Aguardar aprovação antes de DIA 4

---

## 🎯 METAS DE SUCESSO

- ✅ Taxa de sucesso checklist: **>95%**
- ✅ Bundle total: **<2 MB**
- ✅ Lighthouse Performance médio: **>80**
- ✅ Nenhuma query React Query com fetchCount >5
- ✅ Carregamento de páginas: **<3s**
- ✅ Sem erros console críticos

---

**Boa sorte com os testes!** 🚀
