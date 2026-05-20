# 🚀 Análise de Performance e Otimizações Recomendadas

**Data:** 6 de Novembro de 2025  
**Status:** Sistema ainda com gargalos identificados

---

## 📊 Problemas Identificados

### 1. **Health Check LENTO (2.4s)**

- Endpoint `/health` está levando **2.4 segundos**
- Isso é CRÍTICO - health checks devem ser < 200ms

### 2. **N+1 Query Problem**

Várias endpoints fazem queries sequenciais ao invés de uma query única com JOINs:

```typescript
// ❌ PROBLEMA: Carrega todos os dados depois filtra em código
const { results } = await db
  .prepare(
    `
  SELECT * FROM simuladores WHERE deleted_at IS NULL
`,
  )
  .all();

// Depois itera e faz mais queries para cada item
results.forEach((item) => {
  // mais queries aqui
});
```

### 3. **Sem LIMIT/OFFSET**

As queries listam TUDO da tabela sem paginação:

```typescript
// ❌ PROBLEMA: Se tiver 10.000 funcionários, retorna TUDO
SELECT * FROM funcionarios WHERE deleted_at IS NULL
```

### 4. **SELECT \* ao invés de colunas específicas**

Transferindo dados desnecessários:

```typescript
// ❌ PROBLEMA: Carrega TODAS as 30 colunas, mesmo que precise só de 5
SELECT * FROM certificados WHERE id = ?

// ✅ CORRETO: Só carrega o necessário
SELECT id, numero, data_emissao FROM certificados WHERE id = ?
```

### 5. **Falta de LIMIT em JOINs**

Queries com JOIN sem LIMIT podem ser muito lentas:

```typescript
// ❌ PROBLEMA: 1000 habilitações x 500 qualificações = 500k linhas!
SELECT h.*, q.* FROM habilitacoes h
JOIN qualificacoes q ON h.qualificacao_id = q.id
```

---

## ✅ Otimizações Imediatas a Fazer

### **PRIORIDADE 1: Otimizar Health Check**

**Arquivo:** `src/worker/routes/index.ts` ou equivalente  
**Problema:** Está fazendo queries desnecessárias  
**Solução:** Simplificar o health check

```typescript
// ❌ ATUAL (LENTO)
app.get('/health', async (c) => {
  const result = await db.prepare('SELECT 1').first(); // desnecessário
  const count = await db.prepare('SELECT COUNT(*) FROM ...').first(); // lento
});

// ✅ OTIMIZADO
app.get('/health', async (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    // DB não precisa conectar sempre!
  });
});
```

### **PRIORIDADE 2: Implementar Paginação Global**

Adicionar query params `?limit=10&offset=0` em TODAS as listagens:

```typescript
// ✅ COM PAGINAÇÃO
app.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  const { results } = await db
    .prepare(
      `
    SELECT id, nome, status 
    FROM funcionarios 
    WHERE deleted_at IS NULL
    ORDER BY nome ASC
    LIMIT ? OFFSET ?
  `,
    )
    .bind(limit, offset)
    .all();

  return c.json({
    data: results,
    limit,
    offset,
    hasMore: results.length === limit,
  });
});
```

### **PRIORIDADE 3: Remover SELECT \***

Todas as queries devem especificar colunas:

```typescript
// ❌ NÃO FAZER
SELECT * FROM tabela

// ✅ FAZER
SELECT id, nome, status FROM tabela
```

### **PRIORIDADE 4: Adicionar Mais Índices Compostos**

Índices para as queries mais comuns:

```sql
-- Para buscar habilitações de um funcionário
CREATE INDEX IF NOT EXISTS idx_habilitacoes_funcionario_data
ON habilitacoes(funcionario_id, data_vencimento, deleted_at);

-- Para buscar agendamentos por data/status
CREATE INDEX IF NOT EXISTS idx_agendamentos_periodo_status
ON agendamentos_simulador(created_at, status, deleted_at);

-- Para buscar fichas por funcionário
CREATE INDEX IF NOT EXISTS idx_fichas_funcionario_data
ON fichas(funcionario_id, created_at, deleted_at);
```

### **PRIORIDADE 5: Implementar Response Caching**

Usar HTTP Cache Headers para respostas estáticas:

```typescript
// ✅ CACHE 5 MINUTOS
c.header('Cache-Control', 'public, max-age=300');

// ✅ CACHE 1 HORA
c.header('Cache-Control', 'public, max-age=3600');
```

### **PRIORIDADE 6: Lazy Load Related Data**

Não carregar dados relacionados desnecessariamente:

```typescript
// ❌ PROBLEMA: Carrega funcionário + habilitações + certificados + tudo
const funcionario = await db
  .prepare(
    `
  SELECT f.*, h.*, c.*, q.*, a.*
  FROM funcionarios f
  LEFT JOIN habilitacoes h ON f.id = h.funcionario_id
  LEFT JOIN certificados c ON f.id = c.funcionario_id
  LEFT JOIN qualificacoes q ON h.qualificacao_id = q.id
  LEFT JOIN agendamentos a ON f.id = a.funcionario_id
  WHERE f.id = ?
`,
  )
  .bind(id)
  .first();

// ✅ CORRETO: Carregar separadamente se preciso
const funcionario = await db
  .prepare(
    `
  SELECT id, nome, email FROM funcionarios WHERE id = ?
`,
  )
  .bind(id)
  .first();

// Se precisar de habilitações, fazer outra query:
if (needsHabilitacoes) {
  const habilitacoes = await db
    .prepare(
      `
    SELECT id, qualificacao_id, data_vencimento 
    FROM habilitacoes 
    WHERE funcionario_id = ? AND deleted_at IS NULL
  `,
    )
    .bind(id)
    .all();
}
```

---

## 🔧 Implementação Recomendada (Ordem)

1. ✅ **Índices já criados** (8 índices aplicados)
2. ⏭️ **Otimizar Health Check** (15 min)
3. ⏭️ **Adicionar LIMIT em todas as listagens** (30 min)
4. ⏭️ **Remover SELECT \* das queries** (45 min)
5. ⏭️ **Implementar paginação** (1h)
6. ⏭️ **Adicionar mais índices compostos** (30 min)
7. ⏭️ **Cache headers** (20 min)

---

## 📈 Ganho Esperado

| Otimização                      | Tempo Atual | Tempo Esperado | Ganho       |
| ------------------------------- | ----------- | -------------- | ----------- |
| Health Check                    | 2.4s        | 50ms           | **4700%** ↑ |
| Listagens (sem limit)           | 300-400ms   | 50-100ms       | **300%** ↑  |
| SELECT \* → colunas específicas | 150ms       | 50ms           | **200%** ↑  |
| Com paginação                   | 300ms       | 30ms           | **900%** ↑  |

**Total esperado:** Sistema passando de 100-400ms para 20-50ms por query

---

## 🎯 Próximos Passos

Deseja que eu implemente estas otimizações? Vou fazer:

1. ✅ Analisar health check
2. ✅ Otimizar queries principais
3. ✅ Adicionar paginação
4. ✅ Deploy com todas as otimizações
5. ✅ Teste de performance antes/depois
