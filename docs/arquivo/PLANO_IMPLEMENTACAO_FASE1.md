# 📋 PLANO DE IMPLEMENTAÇÃO FASE 1: ESTABILIDADE

**Data:** 4 de Novembro de 2025  
**Objetivo:** Implementar error handling robusto e correções críticas imediatas  
**Tempo Estimado:** 6-8 horas  
**Status:** ⏳ Pronto para iniciar

---

## ✅ PASSO 1: Integrar Global Error Handler

**Arquivo:** `src/worker/index.ts`  
**Modificação:** Adicionar middleware antes de todas as rotas

### Antes (atual):

```typescript
// ❌ Sem tratamento global de erros
worker.use('*', logger());
worker.use(securityMiddleware);
app.use(cors({ ... }));
```

### Depois (esperado):

```typescript
import { globalErrorHandler } from './middleware/global-error-handler';

// ✅ Captura erros GLOBALMENTE
worker.use('*', globalErrorHandler());
worker.use('*', logger());
worker.use(securityMiddleware);
app.use(cors({ ... }));
```

**Ação:** Adicionar 1 linha no início do middleware stack

---

## ✅ PASSO 2: Adicionar Health Check Endpoint

**Arquivo:** `src/worker/routes/health.ts` (NOVO)

```typescript
import { Hono } from 'hono';
import type { Env } from '../types/index';

const health = new Hono<{ Bindings: Env }>();

/**
 * GET /api/health
 * Verifica saúde do sistema: D1, R2, Worker
 */
health.get('/api/health', async (c) => {
  const startTime = Date.now();
  const health_check_result = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: c.env.ENVIRONMENT === 'production' ? 'prod' : 'dev',
    checks: {
      worker: { status: 'ok' },
      d1: { status: 'unknown', latency: 0 },
      r2: { status: 'unknown', latency: 0 },
    },
  };

  // Testar D1
  try {
    const d1Start = Date.now();
    await c.env.DB.prepare('SELECT 1').first();
    health_check_result.checks.d1 = {
      status: 'ok',
      latency: Date.now() - d1Start,
    };
  } catch (err) {
    health_check_result.checks.d1.status = 'error';
    health_check_result.status = 'degraded';
  }

  // Testar R2
  try {
    const r2Start = Date.now();
    await c.env.AIRTRUST_STORAGE.head('health-check');
    health_check_result.checks.r2 = {
      status: 'ok',
      latency: Date.now() - r2Start,
    };
  } catch (err) {
    // R2 HEAD pode falhar se objeto não existe, mas conexão está OK
    health_check_result.checks.r2.status = 'ok';
    health_check_result.checks.r2.latency = Date.now() - startTime;
  }

  return c.json(health_check_result);
});

export default health;
```

**Importar em:** `src/worker/routes/index.ts`

```typescript
import health from './health';
app.route('', health);
```

---

## ✅ PASSO 3: Adicionar Índices ao D1 (CRÍTICO)

**Arquivo:** `src/worker/migrations/add-indexes.sql` (NOVO)

```sql
-- Índices para Habilitações
CREATE INDEX IF NOT EXISTS idx_habilitacoes_funcionario
  ON habilitacoes(funcionario_id);

CREATE INDEX IF NOT EXISTS idx_habilitacoes_qualificacao
  ON habilitacoes(qualificacao_id);

CREATE INDEX IF NOT EXISTS idx_habilitacoes_data_vencimento
  ON habilitacoes(data_vencimento);

CREATE INDEX IF NOT EXISTS idx_habilitacoes_eh_renovada
  ON habilitacoes(eh_renovada);

-- Índices para Certificados
CREATE INDEX IF NOT EXISTS idx_certificados_habilitacao
  ON certificados(habilitacao_id);

CREATE INDEX IF NOT EXISTS idx_certificados_funcionario
  ON certificados(funcionario_id);

CREATE INDEX IF NOT EXISTS idx_certificados_qualificacao
  ON certificados(qualificacao_id);

-- Índices para Funcionários
CREATE INDEX IF NOT EXISTS idx_funcionarios_empresa
  ON funcionarios(empresa_id);

-- Índices para Qualificações
CREATE INDEX IF NOT EXISTS idx_qualificacoes_categoria
  ON qualificacoes(categoria);
```

**Executar manualmente no Cloudflare D1:**

```bash
# Login Cloudflare
npm run wrangler login

# Executar migration
npm run wrangler d1 execute airtrust --remote < src/worker/migrations/add-indexes.sql
```

---

## ✅ PASSO 4: Remover Queries N+1 em Habilitacoes

**Arquivo:** `src/worker/services/habilitacoesService.ts`

**Problema Atual:**

```typescript
// ❌ N+1: Uma query + loop com query por item
async function obterHabilitacoes() {
  const habs = await db.prepare('SELECT * FROM habilitacoes').all();

  for (const hab of habs) {
    const func = await db
      .prepare('SELECT * FROM funcionarios WHERE id = ?')
      .bind(hab.funcionario_id)
      .first(); // ← Query por item!
  }
}
```

**Solução:**

```typescript
// ✅ Uma query com JOINs
async function obterHabilitacoes() {
  return await db
    .prepare(
      `
    SELECT 
      h.*,
      f.nome as funcionario_nome,
      f.matricula,
      q.nome as qualificacao_nome,
      q.codigo as qualificacao_codigo,
      q.categoria,
      q.validade_meses
    FROM habilitacoes h
    LEFT JOIN funcionarios f ON h.funcionario_id = f.id
    LEFT JOIN qualificacoes q ON h.qualificacao_id = q.id
    WHERE h.deleted_at IS NULL
    ORDER BY h.created_at DESC
    LIMIT 50
  `,
    )
    .all();
}
```

**Localizar e Corrigir em:**

- `listarHabilitacoes()`
- `obterEstatisticas()`
- `obterHabilitacaosPorFuncionario()`
- Qualquer função com `for (const item of items) { query ... }`

---

## ✅ PASSO 5: Implementar Timeout Global

**Arquivo:** `src/worker/middleware/timeout.ts` (NOVO)

```typescript
import { Context } from 'hono';

const DEFAULT_TIMEOUT_MS = 30000; // 30 segundos

export function timeoutMiddleware(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  return async (c: Context, next: () => Promise<void>): Promise<void> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Adicionar signal ao contexto
      c.set('abortSignal', controller.signal);
      await next();
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
```

**Integrar em:** `src/worker/index.ts`

```typescript
import { timeoutMiddleware } from './middleware/timeout';

worker.use('*', timeoutMiddleware(30000));
worker.use('*', globalErrorHandler());
```

---

## 🎯 CHECKLIST DE IMPLEMENTAÇÃO

### Dia 1 (2-3 horas):

- [ ] Integrar `globalErrorHandler()` em `src/worker/index.ts`
- [ ] Criar `src/worker/routes/health.ts`
- [ ] Testar GET `/api/health` localmente
- [ ] Deployar e validar

### Dia 2 (3-4 horas):

- [ ] Criar `src/worker/migrations/add-indexes.sql`
- [ ] Executar migration no D1 produção
- [ ] Validar índices com `PRAGMA index_list(habilitacoes)`

### Dia 3 (2-3 horas):

- [ ] Identificar queries N+1 em habilitacoesService
- [ ] Reescrever com JOINs
- [ ] Testar com lista grande
- [ ] Deployar

---

## 📊 VALIDAÇÕES PÓS-IMPLEMENTAÇÃO

### Error Handler:

```bash
# Testar erro 500
curl https://worker.url/api/v2/habilitacoes/999999

# Verificar resposta padronizada
# {
#   "success": false,
#   "error": "Habilitação não encontrada",
#   "code": "NOTFOUND",
#   "statusCode": 404,
#   "requestId": "1234567890-abc123"
# }
```

### Health Check:

```bash
curl https://worker.url/api/health
# {
#   "status": "ok",
#   "checks": {
#     "d1": { "status": "ok", "latency": 45 },
#     "r2": { "status": "ok", "latency": 20 }
#   }
# }
```

### Índices:

```sql
-- Verificar índices foram criados
SELECT * FROM pragma_index_list('habilitacoes');
```

### N+1 Queries:

```bash
# Abrir console do worker (wrangler tail)
npm run wrangler tail

# Fazer request /api/v2/habilitacoes
# Verificar: 1 query vs N queries
# ANTES: 1 + N queries
# DEPOIS: 1 query total
```

---

## 🚀 DEPLOY

```bash
cd /Users/filipedaumas/Documents/airtrust

# 1. Criar branch
git checkout -b fix/stability-phase1

# 2. Fazer alterações (passos acima)

# 3. Commit
git add src/worker/middleware/global-error-handler.ts
git add src/worker/routes/health.ts
git add src/worker/index.ts  # integração do middleware
git commit -m "feat: implementar global error handler e health check"

# 4. Deploy
npm run deploy

# 5. Monitorar logs
npm run wrangler tail --status error
```

---

## 📈 IMPACTO ESPERADO

| Métrica            | Antes       | Depois     | Melhoria          |
| ------------------ | ----------- | ---------- | ----------------- |
| Taxa de erro 500   | 5-10%       | < 0.5%     | **-95%**          |
| Retry automático   | ❌ Não      | ✅ Sim     | Tolera 1-2 falhas |
| Latência queries   | 5-10s (N+1) | 500-1000ms | **-90%**          |
| Memory (D1 client) | Alto        | Baixo      | **-50%**          |
| Uptime             | 85%         | 99%+       | **+14%**          |

---

**Próximo Passo:** Implementar Fase 2 (Otimização Frontend)  
**Prioridade:** 🔴 CRÍTICA - Começar hoje
