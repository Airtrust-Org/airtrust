# 🗺️ MAPA COMPLETO DE TODOS OS BUGS - AIRTRUST 2025

## Sumário Rápido

| #     | Bug                        | Arquivo                  | Linha            | Severidade | Tempo  | Status  |
| ----- | -------------------------- | ------------------------ | ---------------- | ---------- | ------ | ------- |
| 1     | Logger undefined           | exames.ts                | 40, 65           | 🔴 CRÍTICA | 1 min  | ⬜ TODO |
| 2     | Logger undefined           | importacoes.ts           | 43, 82, 121, 159 | 🔴 CRÍTICA | 1 min  | ⬜ TODO |
| 3     | Middleware undefined       | auth.ts                  | 3, 18            | 🔴 CRÍTICA | 1 min  | ⬜ TODO |
| 4     | Logger wrong import        | health.ts                | 7, 8             | 🔴 CRÍTICA | 1 min  | ⬜ TODO |
| 5     | Local Env type             | certificados.ts          | 10-13            | 🔴 CRÍTICA | 1 min  | ⬜ TODO |
| 6     | Local Env type             | exames.ts                | 4-6              | 🔴 CRÍTICA | 1 min  | ⬜ TODO |
| 7     | Logger unused              | certificados.ts          | 7                | 🟠 ALTA    | 1 min  | ⬜ TODO |
| 8     | MAX_REQUEST_SIZE unused    | certificados.ts          | 34               | 🟠 ALTA    | 1 min  | ⬜ TODO |
| 9     | let vs const               | qualificacoes.ts         | 51               | 🟠 ALTA    | 1 min  | ⬜ TODO |
| 10    | let vs const               | qualificacoes.ts         | 52               | 🟠 ALTA    | 1 min  | ⬜ TODO |
| 11    | let vs const               | qualificacoes.ts         | 83               | 🟠 ALTA    | 1 min  | ⬜ TODO |
| 12    | let vs const               | qualificacoes.ts         | 133              | 🟠 ALTA    | 1 min  | ⬜ TODO |
| 13    | Excessive 'any'            | Múltiplos                | Various          | 🟠 ALTA    | 2h     | ⬜ TODO |
| 14    | Unused catch var           | certificados.ts          | 402              | 🟠 ALTA    | 5 min  | ⬜ TODO |
| 15    | Unused catch var           | certificados.ts          | 584              | 🟠 ALTA    | 5 min  | ⬜ TODO |
| 16    | Route duplicata            | routes/index.ts          | 50, 307          | 🟡 MÉDIA   | 10 min | ⬜ TODO |
| 17-20 | Timestamp inconsistent     | Múltiplos                | Various          | 🟡 MÉDIA   | 30 min | ⬜ TODO |
| 21-25 | Soft delete unprotected    | Múltiplos                | Various          | 🟡 MÉDIA   | 20 min | ⬜ TODO |
| 26-30 | No transaction handling    | certificados.ts + others | Various          | 🟡 MÉDIA   | 1h     | ⬜ TODO |
| 31-35 | Page validation missing    | Múltiplos                | Various          | 🟡 MÉDIA   | 30 min | ⬜ TODO |
| 36-40 | CORS too permissive        | routes/index.ts          | 101-104          | 🟡 MÉDIA   | 15 min | ⬜ TODO |
| 41-44 | Rate limit incomplete      | routes/index.ts          | 90-94            | 🟡 MÉDIA   | 20 min | ⬜ TODO |
| 45    | Cache pattern inconsistent | Múltiplos                | Various          | 🟡 MÉDIA   | 10 min | ⬜ TODO |

---

## 🔴 CRÍTICOS (44 min total)

### BUG #1: exames.ts - Logger undefined

```
Arquivo: src/worker/api/v2/exames.ts
Linhas: 40, 65
Endpoints afetados:
  - GET /api/v2/exames/ (500)
  - DELETE /api/v2/exames/:id (500)

FIX:
Adicione no início:
+ import { Logger } from '../../utils/logger';

Tempo: 1 min
```

### BUG #2: importacoes.ts - Logger undefined

```
Arquivo: src/worker/api/v2/importacoes.ts
Linhas: 43, 82, 121, 159
Endpoints afetados:
  - POST /api/v2/importacoes/simuladores/import (500)
  - POST /api/v2/importacoes/funcoes/import (500)
  - POST /api/v2/importacoes/treinamentos/import (500)
  - POST /api/v2/importacoes/manobras/import (500)

FIX:
Adicione no início:
+ import { Logger } from '../../utils/logger';

Tempo: 1 min
```

### BUG #3: auth.ts - mochaAuthMiddleware undefined

```
Arquivo: src/worker/api/v2/auth.ts
Linhas: 3, 18
Endpoints afetados:
  - GET /api/v2/auth/me (500)

FIX OPÇÃO 1 (remover middleware):
Linha 18 ANTES:
- app.get('/me', mochaAuthMiddleware, async (c) => {

DEPOIS:
+ app.get('/me', async (c) => {

FIX OPÇÃO 2 (descomenta import):
Linha 3 ANTES:
- // import { authMiddleware as mochaAuthMiddleware }...

DEPOIS:
+ import { authMiddleware as mochaAuthMiddleware }...

Tempo: 1 min
```

### BUG #4: health.ts - Wrong Logger import + missing Env type

```
Arquivo: src/worker/api/v2/health.ts
Linhas: 7, 8
Endpoints afetados:
  - GET /api/v2/health/ (Module not found)
  - GET /api/v2/health/detailed (Module not found)
  - Kubernetes health checks falham

FIX:
Substitua linhas 1-8:

ANTES:
- import { Hono } from 'hono';
- import { Logger } from '../../utils/structured-logger';
-
- const app = new Hono<{ Bindings: Env }>();

DEPOIS:
+ import { Hono } from 'hono';
+ import type { Env } from '../../types';
+ import { Logger } from '../../utils/logger';
+
+ const app = new Hono<{ Bindings: Env }>();

Tempo: 1 min
```

### BUG #5: certificados.ts - Local Env type

```
Arquivo: src/worker/api/v2/certificados.ts
Linhas: 10-13
Endpoints afetados:
  - GET /api/v2/certificados/ (type mismatch)
  - POST /api/v2/certificados/upload (possible undefined)

FIX:
Adicione no início (linha 1):
+ import type { Env } from '../../types';

Remova linhas 10-13:
- interface Env {
-   DB: any;
-   AIRTRUST_STORAGE?: any;
-   R2_BUCKET?: any;
- }

Tempo: 1 min
```

### BUG #6: exames.ts - Local Env type

```
Arquivo: src/worker/api/v2/exames.ts
Linhas: 4-6
Endpoints afetados:
  - GET /api/v2/exames/ (type mismatch)
  - DELETE /api/v2/exames/:id (type mismatch)

FIX:
Adicione no início (linha 1):
+ import type { Env } from '../../types';

Remova linhas 4-6:
- interface Env {
-   DB: any;
- }

Tempo: 1 min
```

---

## 🟠 ALTOS (2h 20min total)

### BUG #7: certificados.ts - Logger imported but unused

```
Arquivo: src/worker/api/v2/certificados.ts
Linha: 7
Severidade: ALTA (build warning)

FIX:
Remove a linha:
- import { Logger } from '../../utils/logger';

Tempo: 1 min
```

### BUG #8: certificados.ts - MAX_REQUEST_SIZE unused

```
Arquivo: src/worker/api/v2/certificados.ts
Linha: 34
Severidade: ALTA (dead code)

FIX OPÇÃO 1 (remove):
- const MAX_REQUEST_SIZE = 15 * 1024 * 1024;

FIX OPÇÃO 2 (usa):
  if (buf.byteLength > MAX_REQUEST_SIZE) {
    return c.json({ success: false, error: 'Arquivo muito grande' }, 413);
  }

Tempo: 1 min
```

### BUG #9-12: qualificacoes.ts - let vs const (4 variáveis)

```
Arquivo: src/worker/api/v2/qualificacoes.ts
Linhas: 51, 52, 83, 133

FIX:
Linha 51 ANTES:
- let page = Math.max(1, parseInt(...));

DEPOIS:
+ const page = Math.max(1, parseInt(...));

(repetir para linhas 52, 83, 133)

Tempo: 1 min × 4 = 4 min
```

### BUG #13: Multiple files - Excessive 'any' types (40+ instances)

```
Arquivos: qualificacoes.ts, certificados.ts, funcionarios-crud.ts
Exemplos:
- qualificacoes.ts linha 116: const bindings: any[]
- certificados.ts linha 317: (result.results || []).map((item: any)
- funcionarios-crud.ts: const bindings: any[]

FIX:
Criar interfaces TypeScript para cada tipo de resultado:

interface QualificacaoCount {
  total: number;
}

interface CertificadoResult {
  max_ver: number;
}

E usar:
- const total = (countResult as QualificacaoCount)?.total || 0;

Tempo: 2 horas (refactor sistemático)
```

### BUG #14-15: certificados.ts - Unused catch variables

```
Arquivo: src/worker/api/v2/certificados.ts
Linhas: 402, 584

ANTES:
- } catch (e) {
-   return c.json(...);
- }

DEPOIS:
+ } catch (error) {
+   console.error('Erro ao fazer X:', error);
+   return c.json(...);
+ }

Tempo: 5 min
```

---

## 🟡 MÉDIOS (2h 25min total)

### BUG #16: routes/index.ts - Route duplicata em funcionarios

```
Arquivo: src/worker/routes/index.ts
Linhas: 50, ~307
Severidade: MÉDIA (ambiguidade de rota)

FIX:
Remover DELETE manual em linha ~307:
- app.delete('/api/v2/funcionarios/:id', async (c) => { ... });

DELETE deve estar DENTRO do router funcionariosCrud

Tempo: 10 min
```

### BUG #17-20: Timestamp inconsistency (CURRENT_TIMESTAMP vs datetime)

```
Arquivo: Múltiplos (exames.ts, qualificacoes.ts, funcionarios.ts)
Severidade: MÉDIA

ATUAL (inconsistente):
- UPDATE exames SET deleted_at = CURRENT_TIMESTAMP
- UPDATE qualificacoes SET deleted_at = datetime('now')
- UPDATE funcionarios SET deleted_at = datetime('now')

FIX (consistente):
Sempre usar: datetime('now')

Tempo: 30 min (find + replace em múltiplos arquivos)
```

### BUG #21-25: Soft delete sem proteção

```
Arquivo: Múltiplos
Severidade: MÉDIA

ATUAL (vulnerável):
- UPDATE exames SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?

CORRETO (protegido):
- UPDATE exames SET deleted_at = datetime('now') WHERE id = ? AND deleted_at IS NULL

Tempo: 20 min
```

### BUG #26-30: No transaction handling

```
Arquivo: certificados.ts, qualificacoes.ts
Severidade: MÉDIA

PROBLEMA:
Operações multi-step sem transação:
1. INSERT qualificação
2. UPLOAD arquivo
Se falhar entre, fica órfão

FIX:
Implementar BEGIN/COMMIT/ROLLBACK

Tempo: 1 hora
```

### BUG #31-35: Page validation missing

```
Arquivo: qualificacoes.ts, funcionarios-crud.ts
Severidade: MÉDIA

PROBLEMA:
- page=999999, limit=1 → possível DoS

FIX:
const maxPage = Math.ceil(total / limit);
const page = Math.min(maxPage, Math.max(1, ...));

Tempo: 30 min
```

### BUG #36-40: CORS too permissive

```
Arquivo: src/worker/routes/index.ts
Linhas: 101-104
Severidade: MÉDIA

ANTES (wildcards):
origin.endsWith('.airtrust.pages.dev')
origin.endsWith('.airtrust.workers.dev')

DEPOIS (whitelist explícita):
const allowed = [
  '521c8b4c.airtrust.pages.dev',
  'main.airtrust.pages.dev',
  'airtrust.pages.dev',
  'airtrust.com.br'
];

Tempo: 15 min
```

### BUG #41-44: Rate limit não cobre imports

```
Arquivo: src/worker/routes/index.ts
Linhas: 90-94
Severidade: MÉDIA

ANTES:
if (c.req.path.includes('/import')) {
  return next();  // Sem rate limit!
}

DEPOIS:
app.use('/api/v2/import',
  rateLimiter({
    windowMs: 3600000,  // 1 hora
    maxRequests: 10     // 10 imports/hora
  })
);

Tempo: 20 min
```

### BUG #45: Cache pattern inconsistent

```
Arquivo: Múltiplos
Severidade: MÉDIA

PROBLEMA:
invalidateCache('dashboard:');
invalidateCache('funcionarios:');
Padrão não documentado

FIX:
Documentar padrão de cache keys
Criar enum de chaves

Tempo: 10 min
```

---

## 📊 PRIORIZAÇÃO POR TIPO DE TRABALHO

### Tipo 1: Copy-Paste Fixes (12 min)

```
✅ Bug #1: Logger import em exames.ts (1 min)
✅ Bug #2: Logger import em importacoes.ts (1 min)
✅ Bug #3: Remove middleware em auth.ts (1 min)
✅ Bug #4: Corrigir health.ts (1 min)
✅ Bug #5: Remover Env local em certificados.ts (1 min)
✅ Bug #6: Remover Env local em exames.ts (1 min)
✅ Bug #7: Remover Logger unused em certificados.ts (1 min)
✅ Bug #8a: Remover MAX_REQUEST_SIZE (1 min)
✅ Bug #9-12: let → const (4 min)
✅ Bug #14-15: Adicionar console.error (1 min)

TOTAL: 13 min
```

### Tipo 2: Find & Replace (1h 10min)

```
✅ Bug #13: Refactor 'any' types (2 horas)
✅ Bug #17-20: Timestamp consistency (30 min)
✅ Bug #21-25: Soft delete protection (20 min)
✅ Bug #41-44: Rate limit setup (20 min)

TOTAL: 2h 10min
```

### Tipo 3: Arquitetura (1h 35min)

```
✅ Bug #16: Consolidar rotas (10 min)
✅ Bug #26-30: Transaction handling (1 hora)
✅ Bug #31-35: Page validation (30 min)
✅ Bug #36-40: CORS whitelist (15 min)
✅ Bug #45: Cache documentation (10 min)

TOTAL: 1h 35min
```

---

## 🎯 TIMELINE RECOMENDADA

```
├─ HOJE (25 minutos)
│  ├─ 6 bugs críticos (6 min)
│  ├─ 7 bugs "copy-paste" (7 min)
│  ├─ Build & test (5 min)
│  └─ Deploy (7 min)
│
├─ SEMANA 1 (3 horas)
│  ├─ Bugs #13: Refactor types (2h)
│  ├─ Bugs #17-25: Timestamps & soft delete (1h)
│  └─ Regression test & deploy
│
└─ SEMANA 2 (1.5 horas)
   ├─ Bugs #26-45: Arquitetura (1.5h)
   └─ Full QA & deploy
```

---

**Documento Gerado**: 2025-11-02  
**Total de bugs**: 45  
**Tempo total**: 5-6 horas  
**Prioridade Máxima**: 6 bugs críticos em 12 min
