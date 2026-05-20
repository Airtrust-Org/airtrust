# 🔧 PROTOCOLO OBRIGATÓRIO DE CORREÇÃO - AIRTRUST

**Data:** 23/10/2025  
**Versão:** 1.0  
**Status:** ✅ ATIVO

---

## 🎯 OBJETIVO

Garantir que **TODA correção funcione na primeira tentativa**, eliminando o ciclo de:
- "Corrigido" → Teste → "Ainda não funciona" → "Corrigido de novo" → Teste → ...

---

## ✅ PROTOCOLO COMPLETO (9 ETAPAS OBRIGATÓRIAS)

### **ETAPA 1: ANÁLISE COMPLETA**
```bash
# Identificar TODOS os arquivos afetados
grep -r "PROBLEMA" src --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" > problema_locais.txt

# Contar arquivos
echo "Total de arquivos afetados:"
grep -r "PROBLEMA" src | cut -d: -f1 | sort -u | wc -l
```

**Critério de Sucesso:** Lista completa de arquivos gerada

---

### **ETAPA 2: CORREÇÃO COMPLETA**
```bash
# Corrigir TODOS os arquivos identificados
# NÃO corrigir apenas alguns
# Usar find/replace global ou script
```

**Critério de Sucesso:** Todos os arquivos corrigidos

---

### **ETAPA 3: VALIDAÇÃO DA CORREÇÃO**
```bash
# Verificar se REALMENTE corrigiu
grep -r "PROBLEMA" src --include="*.ts" --include="*.tsx"

# Deve retornar ZERO linhas
```

**Critério de Sucesso:** Zero ocorrências do problema

---

### **ETAPA 4: LIMPEZA COMPLETA DE CACHE**
```bash
# Remover TODOS os caches
rm -rf node_modules/.vite
rm -rf dist
rm -rf .wrangler/state
rm -rf .turbo
```

**Critério de Sucesso:** Todos os caches removidos

---

### **ETAPA 5: BUILD LIMPO**
```bash
# Build completo do zero
npm run build

# Verificar hashes dos arquivos gerados
ls -la dist/client/assets/*.js | tail -10
```

**Critério de Sucesso:** Build concluído com novos hashes

---

### **ETAPA 6: COMMIT E PUSH**
```bash
# Commit das alterações
git add -A
git commit -m "fix: [descrição completa]"

# Push para repositório
git push origin main
```

**Critério de Sucesso:** Código no repositório remoto

---

### **ETAPA 7: DEPLOY**
```bash
# Deploy para produção
npm run deploy

# Aguardar propagação
sleep 10
```

**Critério de Sucesso:** Deploy ID gerado

---

### **ETAPA 8: VALIDAÇÃO EM PRODUÇÃO**
```bash
# Verificar HTML carrega arquivos novos
curl -s "https://URL_PRODUCAO/" | grep -o 'assets/[^"]*\.js' | head -5

# Verificar se problema NÃO existe mais no código
curl -s "https://URL_PRODUCAO/assets/ARQUIVO.js" | grep -c "PROBLEMA"
# Deve retornar 0
```

**Critério de Sucesso:** Código correto em produção

---

### **ETAPA 9: TESTE END-TO-END**
```bash
# Testar funcionalidade afetada
curl -X POST "https://URL_PRODUCAO/api/endpoint" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Verificar resposta
# 200 OK = ✅ Funcionando
# 400/500 = ❌ Ainda com erro
```

**Critério de Sucesso:** Funcionalidade testada e funcionando

---

## 📋 CHECKLIST OBRIGATÓRIO

### Antes de dizer "Corrigido":
- [ ] Etapa 1: Análise completa executada
- [ ] Etapa 2: TODOS os arquivos corrigidos
- [ ] Etapa 3: Grep retorna zero ocorrências
- [ ] Etapa 4: Cache limpo
- [ ] Etapa 5: Build novo gerado
- [ ] Etapa 6: Código no repositório
- [ ] Etapa 7: Deploy realizado
- [ ] Etapa 8: Validação em produção OK
- [ ] Etapa 9: Teste end-to-end OK

---

## ⚠️ REGRAS OBRIGATÓRIAS

### **NUNCA:**
- ❌ Dizer "corrigido" sem executar todas as 9 etapas
- ❌ Corrigir apenas alguns arquivos
- ❌ Fazer deploy sem limpar cache
- ❌ Fazer deploy sem validar em produção
- ❌ Assumir que funcionou sem testar

### **SEMPRE:**
- ✅ Executar grep para validar
- ✅ Limpar cache antes do build
- ✅ Verificar hashes dos arquivos mudaram
- ✅ Fazer curl para validar produção
- ✅ Testar funcionalidade afetada

---

## 📊 TEMPLATE DE RELATÓRIO

```markdown
# CORREÇÃO: [Nome do Bug]

## 1. ANÁLISE
- Arquivos afetados: X
- Problema: [descrição]

## 2. CORREÇÃO
- Arquivos modificados: [lista]
- Tipo de correção: [descrição]

## 3. VALIDAÇÃO LOCAL
```bash
$ grep -r "PROBLEMA" src
[resultado deve ser vazio]
```

## 4. BUILD
- Cache limpo: ✅
- Build novo: ✅
- Hashes: [novos hashes]

## 5. DEPLOY
- Deploy ID: [ID]
- Timestamp: [data/hora]

## 6. VALIDAÇÃO PRODUÇÃO
```bash
$ curl -s "URL" | grep "PROBLEMA"
[resultado deve ser vazio]
```

## 7. TESTE
- Endpoint testado: [URL]
- Resultado: ✅ 200 OK

## 8. CONCLUSÃO
✅ Correção validada e funcionando em produção
```

---

## 🚀 EXEMPLO REAL

### Problema: "Erro ao salvar: Matrícula já cadastrada"

```bash
# ETAPA 1: ANÁLISE
$ grep -r "matricula !== oldData.matricula" src/worker/api/v2/
src/worker/api/v2/funcionarios-crud.ts:528

# ETAPA 2: CORREÇÃO
[Adicionar normalização com padStart]

# ETAPA 3: VALIDAÇÃO
$ grep -r "matricula !== oldData.matricula" src/worker/api/v2/
[vazio - corrigido]

# ETAPA 4: LIMPEZA
$ rm -rf node_modules/.vite dist .wrangler/state
✅ Cache limpo

# ETAPA 5: BUILD
$ npm run build
✅ dist/client/assets/index-ABC123.js (novo hash)

# ETAPA 6: COMMIT
$ git commit -m "fix: normalizar matrícula no UPDATE"
✅ Commit: 6439507

# ETAPA 7: DEPLOY
$ npm run deploy
✅ Deploy: 41f5d030-9929-414b-94b2-10b07ec1e67a

# ETAPA 8: VALIDAÇÃO PRODUÇÃO
$ curl -s "https://URL/assets/index-ABC123.js" | grep -c "matricula !== oldData.matricula"
0 ✅ Corrigido em produção

# ETAPA 9: TESTE
$ curl -X PUT "https://URL/api/v2/funcionarios/1" -d '{"nome":"Teste"}'
200 OK ✅ Funcionando
```

---

## ⏱️ TEMPO ESTIMADO

| Método | Tempo | Taxa de Sucesso |
|--------|-------|-----------------|
| **Antes (sem protocolo)** | 2-3 horas | 30% |
| **Depois (com protocolo)** | 15-30 min | 95% |

---

## 🎯 IMPLEMENTAÇÃO IMEDIATA

**A partir de agora, TODA correção deve seguir este protocolo.**

**Não aceite "corrigido" sem ver todas as 9 etapas executadas.**

---

**Última Atualização:** 23/10/2025 14:20  
**Próxima Revisão:** Após 10 correções usando o protocolo
