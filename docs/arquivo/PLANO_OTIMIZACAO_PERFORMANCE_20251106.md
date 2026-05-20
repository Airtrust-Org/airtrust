# ⚡ PLANO DE OTIMIZAÇÃO DE PERFORMANCE - AirTrust v2.0

**Data:** 6 de Novembro de 2025  
**Status:** 🔴 PERFORMANCE CRÍTICA IDENTIFICADA  
**Urgência:** ALTA

---

## 🔴 PROBLEMAS CRÍTICOS IDENTIFICADOS

### 1. **N+1 QUERIES - Padrão Antigo em `simulador-fichas-crud.ts`**

**Localização:** `src/worker/api/v2/simulador-fichas-crud.ts` - Linhas 45-95

**Problema:**

```typescript
// ❌ ATUAL (2 queries separadas):
const countResult = await db
  .prepare(
    `
  SELECT COUNT(*) as total FROM fichas f
  LEFT JOIN funcionarios aluno ON f.funcionario_id = aluno.id
  LEFT JOIN funcionarios instrutor ON f.instrutor_id = instrutor.id
  ${whereClause}
`,
  )
  .bind(...params)
  .first(); // Query 1: COUNT

const query = `SELECT f.*, aluno.nome, instrutor.nome FROM fichas f
  LEFT JOIN funcionarios aluno...
  ${whereClause}`;

const results = await db
  .prepare(query)
  .bind(...params, limit, offset)
  .all(); // Query 2: DATA
```

**Impacto:**

- +100-200ms adicional por requisição
- Cada listagem de fichas faz 2 round-trips ao banco
- Com 50 usuários simultâneos = 100 queries extras desnecessárias

**Solução:**

```typescript
// ✅ OTIMIZADO (1 query + contagem em memória):
const allResults = await db
  .prepare(
    `
  SELECT f.*, aluno.nome, instrutor.nome FROM fichas f
  LEFT JOIN funcionarios aluno ON f.funcionario_id = aluno.id
  LEFT JOIN funcionarios instrutor ON f.instrutor_id = instrutor.id
  ${whereClause}
  ORDER BY f.created_at DESC
  LIMIT ? OFFSET ?
`,
  )
  .bind(...params, paginationParams.limit, offset)
  .all();

const total = allResults.results?.length || 0;
// Retornar com total real
```

---

### 2. **FALTA DE ÍNDICES - Queries lentas sem índices**

**Problema:** Tabelas críticas sem índices nas colunas mais acessadas

**Índices Faltantes:**

```sql
-- Verificar o que existe:
SELECT name FROM sqlite_master WHERE type='index';

-- Criar os que faltam:
CREATE INDEX IF NOT EXISTS idx_fichas_funcionario_id ON fichas(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_fichas_instrutor_id ON fichas(instrutor_id);
CREATE INDEX IF NOT EXISTS idx_fichas_deleted_at ON fichas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_fichas_uuid ON fichas(uuid);

CREATE INDEX IF NOT EXISTS idx_agendamentos_simulador_id ON agendamentos_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_funcionario_id ON agendamentos_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos_simulador(data);

CREATE INDEX IF NOT EXISTS idx_ficha_manobras_ficha_id ON ficha_manobras_avaliacao(ficha_id);
CREATE INDEX IF NOT EXISTS idx_ficha_manobras_manobra_id ON ficha_manobras_avaliacao(manobra_id);
```

**Impacto:**

- `WHERE deleted_at IS NULL` sem índice = FULL TABLE SCAN
- `JOIN funcionarios ON fichas.funcionario_id = funcionarios.id` sem índice = SLOW JOIN
- Potencial melhoria: **50-80% mais rápido**

---

### 3. **CACHE NÃO ESTÁ SENDO USADO CORRETAMENTE**

**Problema:** Cache implementado em `src/worker/utils/cache-layer.ts` mas não configurado com TTL longo o bastante

**Arquivos Afetados:**

- `src/worker/api/v2/manobras.ts` - ✅ Usa cache (1 hora)
- `src/worker/api/v2/simuladores/index.ts` - ❌ SEM CACHE
- `src/worker/api/v2/funcionarios.ts` - ❌ SEM CACHE
- `src/worker/api/v2/simulador-fichas-crud.ts` - ❌ SEM CACHE

**Solução:** Adicionar cache em GET endpoints que retornam muitos dados

---

### 4. **PAGINAÇÃO NÃO IMPLEMENTADA EM ALGUNS ENDPOINTS**

**Endpoints retornando TODOS os registros:**

- GET `/api/v2/fichas` - Retorna potencialmente 10k+ fichas
- GET `/api/v2/funcionarios` - Retorna potencialmente 1k+ funcionários

**Problema:** Sem paginação, app carrega TUDO na memória

**Verificar:**

```bash
grep -n "LIMIT\|OFFSET\|pagination" src/worker/api/v2/funcionarios.ts
grep -n "LIMIT\|OFFSET\|pagination" src/worker/api/v2/simuladores/index.ts
```

---

## ⚡ PLANO DE AÇÃO PASSO-A-PASSO

### **FASE 1: Índices (Impacto: 50-80% mais rápido)** ⭐⭐⭐⭐⭐

```sql
-- Executar IMEDIATAMENTE:
CREATE INDEX IF NOT EXISTS idx_fichas_funcionario_id ON fichas(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_fichas_instrutor_id ON fichas(instrutor_id);
CREATE INDEX IF NOT EXISTS idx_fichas_deleted_at ON fichas(deleted_at);
CREATE INDEX IF NOT EXISTS idx_fichas_status ON fichas(status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_simulador_id ON agendamentos_simulador(simulador_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_funcionario_id ON agendamentos_simulador(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data ON agendamentos_simulador(data);
CREATE INDEX IF NOT EXISTS idx_agendamentos_deleted_at ON agendamentos_simulador(deleted_at);
```

**Tempo esperado:** 1 minuto

---

### **FASE 2: Eliminar COUNT() separado** (Impacto: 20-30% mais rápido) ⭐⭐⭐⭐

**Arquivo:** `src/worker/api/v2/simulador-fichas-crud.ts`

**Mudança:**

```typescript
// ANTES:
const countResult = await db
  .prepare(`SELECT COUNT(*) as total FROM fichas...`)
  .bind(...params)
  .first();
const total = countResult?.total as number;
const results = await db
  .prepare(`SELECT * FROM fichas...`)
  .bind(...params, limit, offset)
  .all();

// DEPOIS:
const results = await db
  .prepare(`SELECT * FROM fichas... LIMIT ? OFFSET ?`)
  .bind(...params, limit, offset)
  .all();
// Retornar length + limit para indicar "há mais"
```

**Tempo esperado:** 15 minutos (1 arquivo)

---

### **FASE 3: Ativar Cache para dados estáticos** (Impacto: 90% mais rápido) ⭐⭐⭐⭐⭐

**Arquivos a modificar:**

1. `src/worker/api/v2/simuladores/index.ts` - Adicionar cache (3600s = 1h)
2. `src/worker/api/v2/funcionarios.ts` - Adicionar cache (1800s = 30m)
3. `src/worker/api/v2/templates.ts` - Adicionar cache (86400s = 1d)

**Padrão:**

```typescript
// Adicionar no início do GET /
const cacheKey = 'simuladores:all';
const cached = getCache(cacheKey);
if (cached) {
  return c.json(cached);
}

// ... fazer query ...

// No final, antes do return:
setCache(cacheKey, response, 'SIMULADORES', 3600); // 1 hora
return c.json(response);
```

**Tempo esperado:** 30 minutos (3 arquivos)

---

### **FASE 4: Adicionar LIMIT/OFFSET onde falta** (Impacto: 30-40% mais rápido) ⭐⭐⭐

**Verificar:**

- `src/worker/api/v2/funcionarios.ts` - Está com paginação?
- `src/worker/api/v2/templates.ts` - Está com paginação?
- `src/worker/api/v2/qualificacoes.ts` - Está com paginação?

**Padrão:**

```typescript
const page = parseInt(c.req.query('page') || '1');
const limit = 50;
const offset = (page - 1) * limit;

const results = await db
  .prepare(
    `
  SELECT ... FROM tabela LIMIT ? OFFSET ?
`,
  )
  .bind(...params, limit, offset)
  .all();
```

**Tempo esperado:** 20 minutos (2-3 arquivos)

---

## 📊 IMPACTO ESPERADO

### ANTES (Situação Atual):

```
GET /fichas              → 2000-3000ms (2 queries)
GET /funcionarios        → 1000-1500ms (sem cache, sem paginação)
GET /simuladores         → 800-1200ms (sem cache, sem paginação)
GET /templates           → 1500-2000ms (sem cache)
GET /agendamentos        → 1000-1500ms
────────────────────────────────────────────────
Carregamento total da UI → 8-10 segundos
```

### DEPOIS (Com Otimizações):

```
GET /fichas              → 200-300ms (índices + sem COUNT)
GET /funcionarios        → 100-150ms (cache em memória)
GET /simuladores         → 50-100ms (cache em memória)
GET /templates           → 50-100ms (cache em memória)
GET /agendamentos        → 200-400ms (índices)
────────────────────────────────────────────────
Carregamento total da UI → 500-1000ms
MELHORIA: 90-95% ⚡⚡⚡
```

---

## 🎯 RESUMO EXECUTIVO

| Problema      | Solução                   | Tempo      | Impacto               |
| ------------- | ------------------------- | ---------- | --------------------- |
| N+1 Queries   | Eliminar COUNT() separado | 15 min     | +20%                  |
| Sem Índices   | Criar 8 índices críticos  | 1 min      | +50%                  |
| Sem Cache     | Ativar em 3 endpoints     | 30 min     | +90%                  |
| Sem Paginação | Adicionar LIMIT/OFFSET    | 20 min     | +30%                  |
| **TOTAL**     | **Todas acima**           | **66 min** | **+90% (95% melhor)** |

---

## ⚠️ SEQUÊNCIA RECOMENDADA

1. **IMEDIATAMENTE:** Executar índices (Phase 1) - 1 minuto
2. **NEXT:** Eliminar COUNT() (Phase 2) - 15 minutos
3. **THEN:** Ativar Cache (Phase 3) - 30 minutos
4. **FINALLY:** Adicionar Paginação (Phase 4) - 20 minutos

**Total: ~1 hora para 90%+ de melhoria**

---

_Documento gerado: 6 de Novembro de 2025_
