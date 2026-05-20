# 📊 INVENTÁRIO COMPLETO - FORMULÁRIOS DE IMPORTAÇÃO

**Data:** 23/10/2025 01:30  
**Status:** Mapeamento completo realizado

---

## 🎯 PÁGINAS PRINCIPAIS (6 arquivos)

### 1. **Qualificações** (4 páginas)
- ✅ `ImportarTiposPadrao.tsx` - **44 linhas** (NOVO - PADRÃO)
- ⏳ `ImportarTipos.tsx` - **388 linhas** (SUBSTITUIR)
- ⏳ `ImportacaoExcel.tsx` - **377 linhas** (SUBSTITUIR)
- ⏳ `ImportarQualificacoes.tsx` - **14 linhas** (VERIFICAR)

### 2. **Funcionários** (1 página)
- ⏳ `ImportarFuncionarios.tsx` - **350 linhas** (SUBSTITUIR)

### 3. **Genérico** (1 página)
- ⏳ `ImportCSV.tsx` - **378 linhas** (SUBSTITUIR)

---

## 📦 COMPONENTES (19 arquivos)

### **Simuladores** (3 componentes)
1. ⏳ `ImportadorCSVSimuladores.tsx` - **463 linhas** (SUBSTITUIR)
2. ⏳ `ImportModalSimuladores.tsx` - **70 linhas** (SUBSTITUIR)
3. ⏳ `ImportarManobras.tsx` - **272 linhas** (SUBSTITUIR)

### **Qualificações** (1 componente)
4. ⏳ `ImportModalQualificacoes.tsx` - **70 linhas** (SUBSTITUIR)

### **Funcionários** (2 componentes)
5. ⏳ `ImportModalNovo.tsx` - **69 linhas** (SUBSTITUIR)
6. ⏳ `ImportModal.tsx` (funcionarios) - **91 linhas** (SUBSTITUIR)

### **Treinamentos** (1 componente)
7. ⏳ `ImportModalTreinamentos.tsx` - **70 linhas** (SUBSTITUIR)

### **Shared/Genéricos** (3 componentes)
8. ⏳ `AdvancedImportModal.tsx` - **715 linhas** (SUBSTITUIR)
9. ⏳ `CertificacoesImportModal.tsx` - **865 linhas** (SUBSTITUIR)
10. ⏳ `ImportCSVModal.tsx` - **566 linhas** (SUBSTITUIR)
11. ⏳ `ImportValidator.tsx` - **218 linhas** (MANTER - Utilitário)

### **Modals** (2 componentes)
12. ⏳ `UniversalImportModal.tsx` - **351 linhas** (SUBSTITUIR)
13. ⏳ `ImportModal.tsx` (modals) - **146 linhas** (SUBSTITUIR)

### **ImportExport** (2 componentes)
14. ⏳ `ImportButton.tsx` - **34 linhas** (MANTER - Botão simples)
15. ⏳ `ImportModal.tsx` (ImportExport) - **54 linhas** (SUBSTITUIR)

### **Common** (2 componentes)
16. ✅ `ImportacaoPadrao.tsx` - **391 linhas** (NOVO - BASE)
17. ⏳ `ImportacaoUniversal.tsx` - **102 linhas** (SUBSTITUIR)

### **Root** (2 componentes)
18. ⏳ `ImportCSVModal.tsx` (root) - **238 linhas** (SUBSTITUIR)
19. ⏳ `ImportModal.tsx` (root) - **281 linhas** (SUBSTITUIR)

---

## 🔧 ENDPOINTS BACKEND (10 arquivos)

### **Qualificações**
1. `qualificacoes-import.ts` - 418 linhas
2. `tipos-qualificacoes-import.ts` - 338 linhas

### **Certificações**
3. `certificacoes-import-robust.ts` - 1034 linhas
4. `import-certificacoes.ts` - 443 linhas
5. `import-certificacoes-batch.ts` - 683 linhas
6. `certificacoes-direct-import.ts` - 373 linhas

### **Manobras**
7. `import-manobras.ts` - 229 linhas

### **Genéricos**
8. `import.ts` - 450 linhas
9. `import-clean.ts` - 283 linhas
10. `importacoes.ts` - 180 linhas

---

## 📊 ESTATÍSTICAS

### **Frontend:**
- **Total de arquivos:** 25
- **Total de linhas:** ~6.500 linhas
- **Arquivos para substituir:** 23
- **Arquivos novos (padrão):** 2
- **Redução esperada:** ~85% (de 6.500 para ~1.000 linhas)

### **Backend:**
- **Total de arquivos:** 10
- **Total de linhas:** ~4.500 linhas
- **Status:** Funcionando (não precisa alterar)

---

## 🎯 PLANO DE PADRONIZAÇÃO

### **FASE 1: Principais (Prioridade ALTA)**
1. ✅ ImportacaoPadrao.tsx (BASE) - CRIADO
2. ✅ ImportarTiposPadrao.tsx (EXEMPLO) - CRIADO
3. ⏳ ImportarFuncionarios.tsx → ImportarFuncionariosPadrao.tsx
4. ⏳ ImportacaoExcel.tsx → ImportarQualificacoesPadrao.tsx
5. ⏳ ImportarManobras.tsx → ImportarManobrasPadrao.tsx
6. ⏳ ImportModalTreinamentos.tsx → ImportarTreinamentosPadrao.tsx

### **FASE 2: Modais (Prioridade MÉDIA)**
7. ⏳ ImportModalSimuladores.tsx
8. ⏳ ImportModalQualificacoes.tsx
9. ⏳ UniversalImportModal.tsx
10. ⏳ AdvancedImportModal.tsx

### **FASE 3: Certificações (Prioridade MÉDIA)**
11. ⏳ CertificacoesImportModal.tsx
12. ⏳ ImportCSVModal.tsx (shared)

### **FASE 4: Genéricos (Prioridade BAIXA)**
13. ⏳ ImportCSV.tsx
14. ⏳ ImportModal.tsx (todos)
15. ⏳ ImportacaoUniversal.tsx

### **FASE 5: Limpeza (Prioridade BAIXA)**
16. 🗑️ Deletar arquivos antigos após testes
17. 🗑️ Deletar duplicados
18. 📝 Atualizar rotas e imports

---

## 💡 BENEFÍCIOS DA PADRONIZAÇÃO

### **Código:**
- ✅ Redução de ~85% no código
- ✅ Manutenção centralizada
- ✅ Zero duplicação

### **UX:**
- ✅ Interface consistente
- ✅ Mesma experiência em todos os módulos
- ✅ Feedback visual padronizado

### **Funcionalidades:**
- ✅ Preview automático
- ✅ Conversão de datas do Excel
- ✅ Histórico de importações
- ✅ Download de template
- ✅ Validação de colunas
- ✅ Tratamento de erros

---

## 🚀 PRÓXIMOS PASSOS

### **Opção A: Substituição Completa (30 min)**
1. Criar 6 arquivos principais com padrão
2. Atualizar rotas
3. Testar cada um
4. Deletar antigos

### **Opção B: Substituição Gradual (1h)**
1. Criar novos com sufixo "Padrao"
2. Manter antigos funcionando
3. Testar lado a lado
4. Migrar rotas gradualmente
5. Deletar antigos após validação

### **Opção C: Híbrido (45 min)**
1. Substituir 6 principais agora
2. Deixar modais para depois
3. Testar principais
4. Continuar depois

---

## 📋 CHECKLIST DE EXECUÇÃO

### **Para cada formulário:**
- [ ] Identificar colunas obrigatórias
- [ ] Identificar colunas opcionais
- [ ] Criar exemplo de dados
- [ ] Definir endpoint da API
- [ ] Definir endpoint de histórico
- [ ] Criar arquivo novo
- [ ] Atualizar rota
- [ ] Testar importação
- [ ] Validar histórico
- [ ] Deletar arquivo antigo

---

**Última Atualização:** 23/10/2025 01:30  
**Responsável:** Cascade AI  
**Status:** ✅ Inventário completo - Pronto para execução
