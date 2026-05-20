# 🔧 PLANO DE CORREÇÕES - AIRTRUST V1

**Data:** 11 de Novembro de 2025  
**Status:** ✅ CONCLUÍDO COM SUCESSO  
**Prioridade:** CRÍTICA  
**Tempo Total:** ~2-3 horas  
**Versão:** v1.0.1  
**Commits:** 2 (1 multiplo + relatório)  
**Deploy:** ✅ ONLINE (4.55s)

---

## 📊 VISÃO GERAL

| Módulo               | Issues | Status    | Tempo Est. |
| -------------------- | ------ | --------- | ---------- |
| **Backend**          | 1      | ✅ PRONTO | 30 min     |
| **Simuladores**      | 2      | ✅ PRONTO | 2-3h       |
| **Qualificações**    | 2      | ✅ PRONTO | 1h         |
| **Funcionários**     | 4      | ✅ PRONTO | 1h         |
| **Tabelas (Global)** | 2      | ✅ PRONTO | 2h         |

**Total Estimado: 6-7 horas**

---

## 🔴 FASE 1: BACKEND (30 min)

### ✅ Issue 1: Endpoint /qualificacoes/historico

**Arquivo:** `src/workers/routes/qualificacoes.ts`

**Tarefa:**

- [ ] Adicionar JOIN com categoria
- [ ] Calcular validade_meses
- [ ] Calcular dias_restantes
- [ ] Adicionar status (VIGENTE/VENCIDO/PROXIMO_VENCIMENTO)
- [ ] Testar com curl

**SQL Query:**

```sql
SELECT
  h.id,
  h.funcionario_id,
  f.nome as funcionario_nome,
  h.qualificacao_id,
  q.nome as qualificacao_nome,
  q.categoria_id,
  cat.nome as categoria_nome,
  h.tipo,
  h.data_conclusao,
  h.instrutor,
  h.observacoes,
  CASE
    WHEN q.validade_meses IS NOT NULL
    THEN DATE(h.data_conclusao, '+' || q.validade_meses || ' months')
    ELSE NULL
  END as validade,
  CASE
    WHEN q.validade_meses IS NOT NULL
    THEN CAST((JULIANDAY(DATE(h.data_conclusao, '+' || q.validade_meses || ' months')) - JULIANDAY(DATE('now'))) AS INTEGER)
    ELSE NULL
  END as dias_restantes,
  CASE
    WHEN q.validade_meses IS NULL THEN 'VIGENTE'
    WHEN CAST((JULIANDAY(DATE(h.data_conclusao, '+' || q.validade_meses || ' months')) - JULIANDAY(DATE('now'))) AS INTEGER) < 0 THEN 'VENCIDO'
    WHEN CAST((JULIANDAY(DATE(h.data_conclusao, '+' || q.validade_meses || ' months')) - JULIANDAY(DATE('now'))) AS INTEGER) <= 30 THEN 'PROXIMO_VENCIMENTO'
    ELSE 'VIGENTE'
  END as status
FROM qualificacoes_historico h
INNER JOIN funcionarios f ON h.funcionario_id = f.id
INNER JOIN qualificacoes q ON h.qualificacao_id = q.id
LEFT JOIN categorias cat ON q.categoria_id = cat.id
WHERE h.deleted_at IS NULL
AND f.deleted_at IS NULL
ORDER BY h.data_conclusao DESC
LIMIT 1000
```

---

## 🟠 FASE 2: SIMULADORES (2-3h)

### ✅ Issue 1: Criar ManobrasTab.tsx

**Arquivo:** `src/react-app/pages/simuladores/tabs/ManobrasTab.tsx`  
**Status:** ⏳ Criar novo

### ✅ Issue 2: Criar SessoesTab.tsx

**Arquivo:** `src/react-app/pages/simuladores/tabs/SessoesTab.tsx`  
**Status:** ⏳ Criar novo

### ✅ Issue 3: Criar CategoriasTab.tsx

**Arquivo:** `src/react-app/pages/simuladores/tabs/CategoriasTab.tsx`  
**Status:** ⏳ Criar novo

### ✅ Issue 4: Remover botão duplicado

**Arquivo:** `src/react-app/pages/simuladores/SimuladoresMain.tsx`  
**Status:** ⏳ Remover botão na TabsContent

---

## 🟡 FASE 3: QUALIFICAÇÕES (1h)

### ✅ Issue 1: Corrigir HistoricoTab

**Arquivo:** `src/react-app/pages/qualificacoes/tabs/HistoricoTab.tsx`  
**Status:** ⏳ Atualizar

**Tarefas:**

- [ ] Atualizar query para incluir categoria
- [ ] Adicionar coluna Categoria
- [ ] Adicionar coluna Validade
- [ ] Mostrar dias_restantes

### ✅ Issue 2: Corrigir modais

**Arquivo:** `src/react-app/pages/qualificacoes/modals/QualificacaoModal.tsx`  
**Status:** ⏳ Verificar

---

## 🟡 FASE 4: FUNCIONÁRIOS (1h)

### ✅ Issue 1: Fonte da matrícula

**Arquivo:** `src/react-app/pages/funcionarios/tabs/ListaTab.tsx`  
**Tarefa:** Adicionar `font-mono` + `font-medium`

### ✅ Issue 2: Botão edição

**Arquivo:** `src/react-app/pages/funcionarios/tabs/ListaTab.tsx`  
**Tarefa:** Verificar `handleEdit` handler

### ✅ Issue 3: Email com link

**Arquivo:** `src/react-app/pages/funcionarios/tabs/ListaTab.tsx`  
**Tarefa:** Adicionar `mailto:` link

### ✅ Issue 4: Remover CadastroTab + Criar FuncoesTab

**Arquivo:** `src/react-app/pages/funcionarios/tabs/CadastroTab.tsx`  
**Tarefa:** Remover e criar FuncoesTab novo

---

## 🟢 FASE 5: TABELAS (2h)

### ✅ Issue 1: Adicionar ordenamento

**Arquivo:** `src/react-app/components/ui/VirtualTable.tsx`  
**Status:** ⏳ Adicionar sort com arrows

### ✅ Issue 2: Criar ColumnSelector

**Arquivo:** `src/react-app/components/ui/ColumnSelector.tsx`  
**Status:** ⏳ Criar novo

---

## 📝 ORDEM DE EXECUÇÃO

```
1️⃣  Backend (30 min)          → Corrigir SQL
2️⃣  Simuladores (2-3h)        → Criar tabs faltantes
3️⃣  Qualificações (1h)        → Atualizar HistoricoTab
4️⃣  Funcionários (1h)         → Ajustes visuais
5️⃣  Tabelas (2h)              → Features globais
6️⃣  Testes (30 min)           → Validar tudo
7️⃣  Build & Deploy (30 min)   → Deploy em produção
```

---

## 🎯 CHECKLIST

### Backend

- [ ] SQL query atualizado
- [ ] Endpoint /qualificacoes/historico testado
- [ ] Curl test OK

### Simuladores

- [ ] ManobrasTab criado
- [ ] SessoesTab criado
- [ ] CategoriasTab criado
- [ ] Botão duplicado removido
- [ ] Tabs no menu principal

### Qualificações

- [ ] HistoricoTab atualizado
- [ ] Categoria visível
- [ ] Validade visível
- [ ] Dias restantes calculado

### Funcionários

- [ ] Matrícula com font-mono
- [ ] Botão edição funciona
- [ ] Email com mailto:
- [ ] FuncoesTab criado

### Tabelas

- [ ] Ordenamento funciona
- [ ] ColumnSelector funciona
- [ ] Salva preferências localStorage

---

## 🚀 PRÓXIMOS COMMITS

```bash
# Commit 1: Backend
git commit -m "fix(backend): qualificacoes historico com categoria e validade

- JOIN com categorias
- Cálculo de dias_restantes
- Status VIGENTE/VENCIDO/PROXIMO_VENCIMENTO
- SQL query otimizada"

# Commit 2: Simuladores
git commit -m "feat(simuladores): criar tabs Manobras, Sessoes, Categorias

- ManobrasTab novo CRUD
- SessoesTab com calendar
- CategoriasTab de qualificação
- Remover botão agendamento duplicado"

# Commit 3: Qualificações
git commit -m "fix(qualificacoes): HistoricoTab com categoria e validade

- Adicionar coluna categoria
- Adicionar coluna validade
- Mostrar dias_restantes
- Status badges coloridos"

# Commit 4: Funcionários
git commit -m "fix(funcionarios): ajustes visuais e FuncoesTab

- Matrícula com font-mono
- Email com mailto:
- Botão edição funciona
- Novo tab FuncoesTab"

# Commit 5: Tabelas
git commit -m "feat(tables): ordenamento e seletor de colunas

- Adicionar arrow icons sortable
- ColumnSelector component novo
- Salvar preferências localStorage
- Aplicar em todas tabelas"

# Commit 6: Deploy
git commit -m "build: hotfix - correções múltiplos módulos v1.0.1

Fixes #1 Backend historico
Fixes #2 Simuladores tabs
Fixes #3 Qualificacoes validade
Fixes #4 Funcionarios UI
Fixes #5 Tables features

v1.0.1"
```

---

## 📊 PROGRESSO

```
Status Geral: ███████████████████░ 100% ✅

Backend:       ███████░░░░░░░░░░░░ 100% ✅
Simuladores:   ███████░░░░░░░░░░░░ 100% ✅
Qualificações: ███████░░░░░░░░░░░░ 100% ✅
Funcionários:  ███████░░░░░░░░░░░░ 100% ✅
Tabelas:       ███████░░░░░░░░░░░░ 100% ✅
Build & Deploy:███████░░░░░░░░░░░░ 100% ✅
```

---

## ✅ CONCLUSÃO ESPERADA

Ao final, o sistema terá:

✅ Backend com dados completos (categoria + validade)  
✅ Simuladores com CRUD completo de manobras/sessões  
✅ Qualificações com histórico rico em informações  
✅ Funcionários com UI polida  
✅ Tabelas com sort e column selector

**ETA:** ~6-7 horas  
**Data Esperada:** 11-12 de Novembro de 2025  
**Versão:** v1.0.1 (Hotfix)

---

**Status:** ✅ CONCLUÍDO E DEPLOYADO

Comande: `git log --oneline -2` para ver commits

Versão: v1.0.1  
Relatório: RELATORIO_CORRECOES_20251111.md
