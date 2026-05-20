# 📋 PLANO DE MIGRAÇÃO - Nomenclatura Definitiva

**Data:** 14 de Novembro de 2025  
**Status:** Em execução

## ⚠️ MUDANÇAS CRÍTICAS

### Tabelas Renomeadas:

- ~~`habilitacoes`~~ → **`qualificacoes_historico`**
- ~~`qualificacoes`~~ → **`qualificacoes_tipos`** (catálogo master)
- ~~`tipos_qualificacoes`~~ → **`qualificacoes_tipos`** (mesmo que acima)

### Endpoints Afetados:

- ~~`/api/habilitacoes`~~ → **`/api/qualificacoes-historico`**
- ~~`/api/qualificacoes`~~ → **`/api/qualificacoes-tipos`** (quando for o catálogo)

---

## 📝 CHECKLIST DE MIGRAÇÃO

### 1. Database (SQL)

- [x] Script de migração SQL criado (`MIGRACAO_NOMENCLATURA_DEFINITIVA.sql`)
- [ ] Executar script no banco local
- [ ] Testar dados migrados
- [ ] Backup do banco antes de produção
- [ ] Executar em produção

### 2. Backend - Services

- [ ] `habilitacoesService.ts` → Renomear para `qualificacoesHistoricoService.ts`
- [ ] Atualizar todas as queries SQL internas
- [ ] `qualificacoesService.ts` → Renomear para `qualificacoesTiposService.ts`
- [ ] Atualizar referências em:
  - [ ] `query-cache.ts`
  - [ ] `query-optimization.ts`
  - [ ] `data.service.ts`
  - [ ] `queries.ts`

### 3. Backend - Routes

- [ ] `habilitacoes.ts` → Migrar para `qualificacoes-historico.ts`
- [ ] Atualizar `index.ts` (routes)
- [ ] `confirmDelete.ts` → Atualizar enum de tabelas
- [ ] Criar redirects 301 para endpoints antigos

### 4. Backend - API

- [ ] `api/habilitacoes.ts` → Deprecated (redirect)
- [ ] `api/historico.ts` → Renomear para `qualificacoes-historico.ts`
- [ ] Atualizar imports em `index.ts`

### 5. Frontend - Hooks

- [ ] `useHabilitacoes.ts` → `useQualificacoesHistorico.ts`
- [ ] `useQualificacoes.ts` → `useQualificacoesTipos.ts` (se for catálogo)
- [ ] `useTiposQualificacoes.ts` → `useQualificacoesTipos.ts`

### 6. Frontend - Components

- [ ] `ListaHabilitacoes.tsx` → `ListaQualificacoesHistorico.tsx`
- [ ] Atualizar todos os componentes que importam hooks antigos

### 7. Frontend - Pages

- [ ] `TestModulosProntos.tsx` → Atualizar imports
- [ ] `PaginaQualificacao.tsx` → Verificar endpoint correto

### 8. Database Migrations

- [ ] `0016_habilitacoes_renovacao.sql` → Marcar como deprecated
- [ ] Criar nova migration para qualificacoes_historico

### 9. Tests

- [ ] Atualizar todos os testes com nova nomenclatura
- [ ] `__tests__/hooks.test.ts`
- [ ] `__tests__/api.test.ts`
- [ ] `__tests__/schemas/qualificacoes.test.ts`

### 10. Documentation

- [x] `GUIA_ARQUITETURAL_DEFINITIVO_V3.md` atualizado
- [ ] Atualizar README.md se necessário
- [ ] Atualizar comentários em código

---

## 🔍 ARQUIVOS IDENTIFICADOS PARA CORREÇÃO

### Alta Prioridade (Backend Core):

1. `/src/worker/services/habilitacoesService.ts` (448 linhas)
2. `/src/worker/services/qualificacoesService.ts`
3. `/src/worker/routes/habilitacoes.ts` (390 linhas)
4. `/src/worker/routes/index.ts` (monta todas as rotas)
5. `/src/worker/services/query-cache.ts`
6. `/src/worker/services/queries.ts`

### Média Prioridade (API Endpoints):

7. `/src/worker/api/habilitacoes.ts`
8. `/src/worker/api/historico.ts`
9. `/src/worker/routes/confirmDelete.ts`
10. `/src/worker/api/backup/export.ts`

### Baixa Prioridade (Frontend):

11. `/src/hooks/useHabilitacoes.ts`
12. `/src/hooks/useQualificacoes.ts`
13. `/src/hooks/useTiposQualificacoes.ts`
14. `/src/components/ListaHabilitacoes.tsx`
15. `/src/pages/TestModulosProntos.tsx`

### Migrations (Deprecar):

16. `/src/db/migrations/0016_habilitacoes_renovacao.sql`
17. `/src/worker/migrations/0015_habilitacao_status.sql`
18. `/src/worker/migrations/0017_habilitacoes_timezone_instrutor.sql`

---

## 🚀 ORDEM DE EXECUÇÃO RECOMENDADA

1. **Fase 1 - Database:**

   - Executar `MIGRACAO_NOMENCLATURA_DEFINITIVA.sql` no banco local
   - Verificar dados migrados
   - Testar queries manualmente

2. **Fase 2 - Backend Services:**

   - Renomear/atualizar services
   - Atualizar queries SQL
   - Atualizar cache layer

3. **Fase 3 - Backend Routes:**

   - Atualizar rotas
   - Criar redirects 301
   - Atualizar index.ts

4. **Fase 4 - Frontend:**

   - Atualizar hooks
   - Atualizar components
   - Atualizar pages

5. **Fase 5 - Tests:**

   - Executar todos os testes
   - Corrigir falhas
   - Validar integração

6. **Fase 6 - Production:**
   - Deploy do backend primeiro
   - Executar migração SQL em produção
   - Deploy do frontend
   - Monitorar erros

---

## ⚠️ RISCOS E MITIGAÇÕES

### Risco 1: Downtime durante migração

**Mitigação:** Criar redirects 301 dos endpoints antigos para os novos

### Risco 2: Dados perdidos na migração

**Mitigação:** Backup completo antes de executar + validação de contagem de registros

### Risco 3: Frontend quebrando antes do backend

**Mitigação:** Manter endpoints antigos por 1 semana com deprecation warning

### Risco 4: Cache invalidado incorretamente

**Mitigação:** Limpar todo cache após migração

---

## ✅ VALIDAÇÃO PÓS-MIGRAÇÃO

Execute estas queries para validar:

```sql
-- 1. Verificar contagem de registros
SELECT
  'qualificacoes_tipos' as tabela,
  COUNT(*) as total
FROM qualificacoes_tipos
UNION ALL
SELECT
  'qualificacoes_historico' as tabela,
  COUNT(*) as total
FROM qualificacoes_historico;

-- 2. Verificar FKs intactas
SELECT
  qh.id,
  qh.funcionario_id,
  qh.qualificacao_tipo_id,
  f.nome as funcionario_nome,
  qt.nome as tipo_nome
FROM qualificacoes_historico qh
LEFT JOIN funcionarios f ON qh.funcionario_id = f.id
LEFT JOIN qualificacoes_tipos qt ON qh.qualificacao_tipo_id = qt.id
WHERE qh.deleted_at IS NULL
LIMIT 10;

-- 3. Verificar status recalculados
SELECT
  status,
  COUNT(*) as total
FROM qualificacoes_historico
WHERE deleted_at IS NULL
GROUP BY status;
```

---

## 📞 CONTATO EM CASO DE PROBLEMAS

- Rollback: Restaurar backup do banco
- Logs: Verificar `console.error` no worker
- Cache: Limpar com `invalidateCache('qualificacoes')`

---

**Última atualização:** 14/11/2025 - 15:30
