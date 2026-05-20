# 🔍 AUDITORIA COMPLETA — Rotas Backend AirTrust

> **Data:** 2025-06-15  
> **Escopo:** 32 arquivos em `worker-airtrust/src/routes/`  
> **Critérios:** Auth, Tenant (empresa_id), Soft Delete, N+1, console.log, `any`, Zod, HTTP status

---

## 📊 RESUMO EXECUTIVO

| Severidade  | Total   |
| ----------- | ------- |
| 🔴 CRITICAL | 28      |
| 🟠 HIGH     | 41      |
| 🟡 MEDIUM   | 35      |
| 🔵 LOW      | 22      |
| **TOTAL**   | **126** |

### Top 5 Issues Sistêmicos

1. **Missing Auth Middleware** — 11 route files completely unprotected
2. **Missing empresa_id Tenant Filter** — 28 of 32 files lack tenant isolation (cross-tenant data leak)
3. **console.log/error in Production** — 25+ files with debug logging
4. **TypeScript `any`** — 15+ files with `any` types
5. **N+1 Queries** — 6 files with per-row database queries in loops

---

## 🔴 CRITICAL — Missing Authentication

Routes that have **NO auth middleware at all**, meaning any unauthenticated user can access them.

### 1. `backup.ts` — ALL routes unprotected

| Line | Route                      | Issue                                                                           |
| ---- | -------------------------- | ------------------------------------------------------------------------------- |
| All  | GET/POST/DELETE /backup/\* | No `auth()`, no `requireRole()`. Anyone can create, restore, or delete backups. |

**Impact:** Full database backup/restore accessible to the internet.  
**Fix:** Add `auth()` + `requireRole('admin')` to all routes.

```ts
// Before
app.post('/create', async (c) => { ... });
// After
app.post('/create', auth(), requireRole('admin'), async (c) => { ... });
```

### 2. `dashboard.ts` — ALL routes unprotected

| Line | Route             | Issue                                                             |
| ---- | ----------------- | ----------------------------------------------------------------- |
| All  | GET /dashboard/\* | No `auth()` on any route. All dashboard metrics exposed publicly. |

**Impact:** Business metrics, employee counts, qualification stats visible without login.  
**Fix:** Add `auth()` to all routes.

### 3. `auditoria.ts` — ALL routes unprotected

| Line | Route             | Issue                                                              |
| ---- | ----------------- | ------------------------------------------------------------------ |
| All  | GET /auditoria/\* | No `auth()`. Contains hardcoded CPF list (26 CPFs) in source code. |

**Impact:** Sensitive PII (CPF numbers) exposed. Debug endpoint left in production.  
**Fix:** Remove from production or add `auth()` + `requireRole('admin')`.

### 4. `auditoria-detalhada.ts` — ALL routes unprotected

| Line | Route                       | Issue                                        |
| ---- | --------------------------- | -------------------------------------------- |
| All  | GET /auditoria-detalhada/\* | No `auth()`. No pagination on large queries. |

**Impact:** All tenant data exposed without authentication.  
**Fix:** Add `auth()` + `requireRole('admin')` or remove from production.

### 5. `categorias.ts` — ALL routes unprotected (incl. writes)

| Line | Route                           | Issue                                                      |
| ---- | ------------------------------- | ---------------------------------------------------------- |
| All  | GET/POST/PUT/DELETE /categorias | No `auth()` on any route including destructive operations. |

**Impact:** Anyone can create, modify, or delete qualification categories.  
**Fix:** Add `auth()` to all routes, `requireRole('admin', 'manager')` to writes.

### 6. `alertas.ts` — ALL routes unprotected

| Line | Route                | Issue                                                    |
| ---- | -------------------- | -------------------------------------------------------- |
| All  | GET/POST /alertas/\* | No `auth()`. Exposes employee qualification expiry data. |

**Impact:** Employee qualification status publicly visible.  
**Fix:** Add `auth()` to all routes.

### 7. `licencas.ts` — ALL routes unprotected

| Line | Route                         | Issue                                              |
| ---- | ----------------------------- | -------------------------------------------------- |
| All  | GET/POST/PUT/DELETE /licencas | No `auth()` on any route. License CRUD fully open. |

**Impact:** Anyone can read, create, modify, or soft-delete pilot licenses.  
**Fix:** Add `auth()` to all routes, `requireRole('admin', 'manager')` to writes.

### 8. `lookup.ts` — ALL routes unprotected

| Line | Route                                          | Issue                               |
| ---- | ---------------------------------------------- | ----------------------------------- |
| All  | GET/POST/DELETE /funcoes, /setores, /aeronaves | No `auth()`. Write operations open. |

**Impact:** Anyone can create or delete reference data (functions, sectors, aircraft).  
**Fix:** Add `auth()` to all routes, `requireRole()` to writes.

### 9. `ficha360.ts` — ALL routes unprotected

| Line | Route                           | Issue                                           |
| ---- | ------------------------------- | ----------------------------------------------- |
| All  | GET /funcionarios/:id/ficha-360 | No `auth()`. Complete employee dossier exposed. |

**Impact:** Complete 360° view of any employee (qualifications, licenses, simulator sessions) publicly accessible.  
**Fix:** Add `auth()`.

### 10. `importacao.ts` — ALL routes unprotected

| Line | Route                   | Issue                                                 |
| ---- | ----------------------- | ----------------------------------------------------- |
| All  | GET/POST /importacao/\* | No `auth()` on any endpoint including data execution. |

**Impact:** Anyone can import, overwrite, or validate data in the system.  
**Fix:** Add `auth()` + `requireRole('admin')` to execution endpoints.

### 11. `assets.ts` — ALL routes unprotected

| Line | Route          | Issue                                  |
| ---- | -------------- | -------------------------------------- |
| All  | GET /assets/\* | No `auth()`. Serves R2 files publicly. |

**Impact:** Any tenant's uploaded files (logos, documents) accessible by key.  
**Fix:** Evaluate if intentional for public logos; if not, add `auth()`. At minimum, validate tenant ownership.

---

## 🔴 CRITICAL — Missing `empresa_id` Tenant Filter (Cross-Tenant Data Leak)

**Only `empresas.ts` and partially `frms.ts` properly filter by empresa_id.** All other files expose data across tenants.

### Files Missing empresa_id Filter

| File                            | Impact                                               |
| ------------------------------- | ---------------------------------------------------- |
| `funcionarios.ts`               | All employees from all companies visible             |
| `simuladores.ts`                | Sessions, instructors, aircraft types across tenants |
| `compliance.ts`                 | Compliance reports for all companies                 |
| `licencas.ts`                   | All pilot licenses across companies                  |
| `habilitacoes.ts`               | All qualifications across companies                  |
| `notificacoes.ts`               | Notifications across companies                       |
| `exportacao.ts`                 | Export ALL data from ALL companies                   |
| `importacao.ts`                 | Import can affect any company's data                 |
| `importacao-xlsx.ts`            | Same as importacao.ts                                |
| `qualificacoes/historico.ts`    | All qualification history across companies           |
| `qualificacoes/tipos.ts`        | Types shared globally (may be intentional)           |
| `qualificacoes/estatisticas.ts` | Stats for all companies combined                     |
| `qualificacoes/atribuicao.ts`   | Can assign qualifications to any company's employees |
| `aeronaves.ts`                  | All aircraft across companies                        |
| `dashboard.ts`                  | Dashboard aggregates all companies                   |
| `alertas.ts`                    | Alerts for all companies                             |
| `categorias.ts`                 | Categories shared globally (may be intentional)      |
| `funcoes.ts`                    | Functions shared globally (may be intentional)       |
| `setores.ts`                    | Sectors shared globally (may be intentional)         |
| `backup.ts`                     | Backs up ALL data                                    |
| `pasta-virtual.ts`              | Documents across companies                           |
| `ficha360.ts`                   | Employee ficha for any company                       |
| `lookup.ts`                     | Lookup data shared globally                          |
| `certificados/validacao.ts`     | Loads ALL certificates to find hash match            |

**Fix (Pattern):** Add `empresa_id` filter to all queries:

```ts
// Before
WHERE f.deleted_at IS NULL
// After
WHERE f.deleted_at IS NULL AND f.empresa_id = ?
```

---

## 🔴 CRITICAL — N+1 Query Patterns

### 1. `compliance.ts` — Lines ~180-195

```ts
// Loops over ALL funcionarios calling getFicha360() individually
for (const func of funcionarios) {
  const ficha = await getFicha360(db, func.id); // 6+ queries per employee!
}
```

**Impact:** For 100 employees = 600+ database queries per request.  
**Fix:** Rewrite with batch JOINs.

### 2. `ficha360.ts` — Lines ~30-140 (`getFicha360`)

```ts
// Per request: 6-8 sequential queries + 2-3 PRAGMA calls
const pragmaHist = await db.prepare("PRAGMA table_info(...)").all(); // 1
const qualificacoesRaw = await db.prepare(...).all(); // 2
// tries multiple table names with PRAGMA...
for (const t of participantesTables) {
  const pragma = await db.prepare(`PRAGMA table_info(${t})`).all(); // 3, 4
}
```

**Impact:** 6-10 sequential queries per ficha360 call. Combined with compliance.ts N+1, this multiplies.  
**Fix:** Cache PRAGMA results (schema doesn't change at runtime). Combine queries.

### 3. `certificados/validacao.ts` — Lines ~35-90

```ts
// Loads ALL certificates (LIMIT 1000), then iterates comparing hashes
const { results } = await db.prepare(`SELECT ... LIMIT 1000`).all();
for (const cert of results) {
  const certHash = await gerarHashCertificado({...}); // crypto per row
  if (certHash === hash.toUpperCase()) { ... }
}
```

**Impact:** Loads up to 1000 rows and computes SHA-256 for each on every validation request.  
**Fix:** Store hash in DB column, then query `WHERE hash = ?` directly.

### 4. `importacao-xlsx.ts` — Lines ~130-200 (funcionarios), ~270-400 (historico), ~460-550 (tipos)

```ts
// Per-row: 1 SELECT to check existence + 1 INSERT or UPDATE
for (let i = 0; i < rows.length; i++) {
  const existente = await db.prepare('SELECT...').bind(row.CPF).first();
  if (existente) {
    await db.prepare('UPDATE...').run();
  } else {
    await db.prepare('INSERT...').run();
  }
}
```

**Impact:** For 500 rows = 1000+ queries.  
**Fix:** Batch with `INSERT ... ON CONFLICT DO UPDATE` or pre-load existing records into a Map.

### 5. `importacao.ts` — Lines ~900-1000 (`/enriquecer-historico`)

```ts
for (const reg of registros as any[]) {
  const funcResults = await db.prepare('SELECT id FROM funcionarios WHERE cpf = ?')...
  const qualResults = await db.prepare('SELECT id, validade FROM qualificacoes_tipos WHERE ...')...
  await db.prepare('UPDATE qualificacoes_historico SET ...')...
}
```

**Impact:** 3 queries per row × up to 1000 rows = 3000 queries.  
**Fix:** Pre-load funcionarios and tipos into Maps, batch UPDATE.

### 6. `simuladores.ts` — Lines ~625, ~700, ~1310

Multiple N+1 patterns: inserting manobras in loops, validating each manobra individually, populating 22 manobras one by one.  
**Fix:** Use batch INSERT.

---

## 🟠 HIGH — `optionalAuth()` Where `auth()` Required

### `funcionarios.ts`

| Line | Route                | Issue                                                  |
| ---- | -------------------- | ------------------------------------------------------ |
| ~48  | GET / (list)         | `optionalAuth()` — employee list should require auth   |
| ~193 | GET /stats           | `optionalAuth()` — statistics should require auth      |
| ~226 | GET /stats/dashboard | `optionalAuth()` — dashboard stats should require auth |

### `aeronaves.ts`

| Line | Route    | Issue                                                  |
| ---- | -------- | ------------------------------------------------------ |
| ~15  | GET /    | `optionalAuth()` — aircraft list could leak fleet info |
| ~30  | GET /:id | `optionalAuth()` — same                                |

### `qualificacoes/tipos.ts`

| Line | Route | Issue                                       |
| ---- | ----- | ------------------------------------------- |
| ~90  | GET / | `optionalAuth()` — qualification types list |

### `frms.ts`

| Line | Route      | Issue                                                                   |
| ---- | ---------- | ----------------------------------------------------------------------- |
| ~58  | ALL routes | `optionalAuth()` on everything, including write operations (PUT/DELETE) |

**Fix:** Change `optionalAuth()` → `auth()` on all routes that return non-public data.

---

## 🟠 HIGH — console.log/console.error in Production

### Files with excessive debug logging:

| File                         | Count | Examples                                                                                  |
| ---------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `simuladores.ts`             | 20+   | `console.log('🔍 ...')`, `console.log('✅ ...')`, emoji prefixes                          |
| `empresas.ts`                | 10+   | `console.log('[EMPRESAS POST]')`, `console.log('[INVITE]')`                               |
| `importacao.ts`              | 30+   | `console.log('[VALIDACAO]')`, `console.log('[BATCH-HISTORICO]')`, debug logs in responses |
| `importacao-xlsx.ts`         | 5+    | `console.error('[IMPORT XLSX ...]')`                                                      |
| `notificacoes.ts`            | 8+    | `console.error('[NOTIFICACOES]')` with emoji                                              |
| `qualificacoes/historico.ts` | 10+   | `console.log('[HISTORICO]')`, `console.log('[RENOVAR]')`                                  |
| `qualificacoes/tipos.ts`     | 5+    | `console.error('[TIPOS_ERROR]')`, `console.log('[COMPLIANCE]')`                           |
| `pasta-virtual.ts`           | 8+    | `console.log`, `console.warn`, `console.error`                                            |
| `ficha360.ts`                | 2     | `console.error('Erro em getFicha360:')`                                                   |
| `compliance.ts`              | 3     | `console.log('[Compliance]')`                                                             |
| `aeronaves.ts`               | 2     | `console.error('[AERONAVES]')`                                                            |
| `funcoes.ts`                 | 3     | `console.error` in catches                                                                |
| `setores.ts`                 | 3     | `console.error` in catches                                                                |
| `lookup.ts`                  | 8     | `console.error('[LOOKUP]')` in every handler                                              |
| `alertas.ts`                 | 5     | `console.log`, `console.error`                                                            |
| `licencas.ts`                | 1     | `console.error('Erro ao buscar dashboard de licenças:')`                                  |
| `habilitacoes.ts`            | 1     | `console.error('[HABILITACOES] Error:')`                                                  |
| `exportacao.ts`              | 3     | `console.error('[EXPORTACAO]')`                                                           |
| `certificados/validacao.ts`  | 4     | `console.log('[VALIDAÇÃO]')`                                                              |
| `auth.ts`                    | 3     | `console.error('[AUTH]')`                                                                 |
| `dashboard.ts`               | 3+    | `console.error`                                                                           |
| `backup.ts`                  | 2+    | `console.error`                                                                           |

**Fix:** Replace with structured logger (already exists as `createLogger` in importacao.ts):

```ts
// Before
console.log('[HISTORICO] Conditions setup.');
// After
// Remove entirely, or use structured logger at appropriate level
```

---

## 🟠 HIGH — `debugLogs` Returned in API Response

### `importacao.ts` — Lines ~100-160, ~700-750

```ts
return c.json({
  success: ...,
  debugLogs,       // ⚠️ Internal debug data exposed to client
  details: errorStack, // ⚠️ Stack trace exposed to client
});
```

**Impact:** Internal implementation details, file paths, and error stacks visible to API consumers.  
**Fix:** Remove `debugLogs` and `details` (stack traces) from production responses.

---

## 🟠 HIGH — Missing Zod Validation (Manual Body Parsing)

| File                 | Route      | Issue                                           |
| -------------------- | ---------- | ----------------------------------------------- |
| `funcionarios.ts`    | POST/PUT / | Manual `if (!body.field)` checks, no Zod schema |
| `licencas.ts`        | POST/PUT / | Manual validation                               |
| `aeronaves.ts`       | POST/PUT / | Manual body type assertion                      |
| `backup.ts`          | POST /     | No input validation at all                      |
| `categorias.ts`      | POST/PUT / | No validation                                   |
| `lookup.ts`          | POST /     | Minimal `if (!body.nome)` only                  |
| `importacao-xlsx.ts` | POST /     | No Zod on parsed rows                           |
| `dashboard.ts`       | N/A        | No write routes, but query params not validated |

**Fix:** Add Zod schemas for all write endpoints:

```ts
const createFuncionarioSchema = z.object({
  nome: z.string().min(1),
  cpf: z.string().regex(/^\d{11}$/),
  // ...
});
```

---

## 🟠 HIGH — TypeScript `any` Usage

### Pervasive `any` across files:

| File                         | Location         | Example                                                             |
| ---------------------------- | ---------------- | ------------------------------------------------------------------- |
| `simuladores.ts`             | ~111             | `async function audit(db: D1Database, p: any)`                      |
| `simuladores.ts`             | ~141, ~502       | `const params: any[] = []`                                          |
| `simuladores.ts`             | ~183             | `(row: any) =>`                                                     |
| `empresas.ts`                | ~54              | `z.any().optional()` ×5 in EmpresaConfigSchema                      |
| `empresas.ts`                | ~517             | `.first<any>()`                                                     |
| `exportacao.ts`              | ~108, ~195, ~275 | `for (const row of rows as any[])`                                  |
| `importacao.ts`              | ~960             | `const params: any[] = []`, `for (const reg of registros as any[])` |
| `importacao-xlsx.ts`         | ~37              | `async function parseXLSXFile(...): Promise<any[]>`                 |
| `importacao-xlsx.ts`         | ~50-60           | `const rows: any[]`, `const rowData: Record<string, any>`           |
| `importacao-xlsx.ts`         | ~170, ~300, ~440 | `errors: any[]`, `err: any`, `error: any`                           |
| `qualificacoes/historico.ts` | ~68, ~78         | `(r: any) => r.name` in ensureSchema                                |
| `qualificacoes/historico.ts` | ~280-290         | `(statsResult as any)?.total` ×6                                    |
| `qualificacoes/validacao.ts` | ~95, ~105        | `(func as any).status`, `(tipo as any).ativo`                       |
| `funcoes.ts`                 | ~69              | `body as any`                                                       |
| `auth.ts`                    | ~533             | `(error as any)?.name`                                              |
| `pasta-virtual.ts`           | ~157             | `(doc: any) =>`                                                     |
| `frms.ts`                    | multiple         | In assertion helpers                                                |

**Fix:** Define proper interfaces/types. Replace `any` with `unknown` + type guards or explicit interfaces.

---

## 🟠 HIGH — Ownership Not Verified Before Mutation

### `frms.ts`

| Line                | Route   | Issue                                              |
| ------------------- | ------- | -------------------------------------------------- |
| PUT /escalas/:id    | ~varies | Updates escala without verifying empresa ownership |
| DELETE /escalas/:id | ~varies | Deletes escala without verifying empresa ownership |

### `licencas.ts`

| Line        | Route | Issue                                                   |
| ----------- | ----- | ------------------------------------------------------- |
| PUT /:id    | ~210  | No check that license belongs to current user's empresa |
| DELETE /:id | ~260  | Same — any authenticated user can delete any license    |

### `qualificacoes/atribuicao.ts`

| Line          | Route | Issue                                                 |
| ------------- | ----- | ----------------------------------------------------- |
| POST /        | ~90   | Can assign qualifications to employees of ANY company |
| POST /renovar | ~165  | Can renew qualifications of ANY company               |

**Fix:** Before any mutation, verify the target record belongs to the authenticated user's empresa.

---

## 🟡 MEDIUM — Missing `deleted_at IS NULL` in Queries

| File                         | Line | Query                                                                                                                  |
| ---------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| `qualificacoes/historico.ts` | ~900 | `SELECT id, categoria, validade FROM qualificacoes_tipos WHERE codigo = ?` — missing `AND deleted_at IS NULL`          |
| `importacao.ts`              | ~940 | `SELECT id FROM funcionarios WHERE cpf = ?` — missing `AND deleted_at IS NULL` in /enriquecer-historico                |
| `ficha360.ts`                | ~120 | `SELECT * FROM fichas_sessao WHERE funcionario_id = ?` — missing `AND deleted_at IS NULL` on fichas_sessao table check |
| `importacao-xlsx.ts`         | ~335 | `SELECT id FROM tipos_qualificacoes WHERE nome = ?` — missing `AND deleted_at IS NULL`                                 |
| `lookup.ts`                  | ~181 | `DELETE` routes don't check deleted_at before soft-deleting (can soft-delete already deleted)                          |

---

## 🟡 MEDIUM — SQL Injection via Dynamic Table Names

### `ficha360.ts` — Lines ~105-115

```ts
for (const t of participantesTables) {
  const pragma = await db.prepare(`PRAGMA table_info(${t})`).all();
  // t comes from a hardcoded array, but pattern is unsafe
}
```

The values come from a hardcoded array so it's not exploitable, but the pattern of interpolating table names is risky. If the array is ever populated from user input, it becomes injectable.

### `qualificacoes/historico.ts` — `buildOrderByClause`

Uses a `SORTABLE_COLUMNS` allowlist map — this is **correct** and safe. ✅

---

## 🟡 MEDIUM — Hardcoded Sensitive Data

### `auditoria.ts`

Contains 26 hardcoded CPF numbers in source code:

```ts
const cpfs = ['12345678901', '98765432100', ...]; // 26 CPFs
```

**Fix:** Remove hardcoded PII. If needed, store in environment variable or database configuration.

---

## 🟡 MEDIUM — Missing Pagination

| File                        | Route             | Issue                                            |
| --------------------------- | ----------------- | ------------------------------------------------ |
| `auditoria-detalhada.ts`    | GET /             | No LIMIT on queries — can return entire database |
| `certificados/validacao.ts` | GET /:hash        | Loads LIMIT 1000 certificates per validation     |
| `licencas.ts`               | GET /             | No pagination (returns all licenses)             |
| `compliance.ts`             | GET /funcionarios | Loads ALL funcionarios then processes each       |
| `dashboard.ts`              | All routes        | No LIMIT on aggregate queries                    |

---

## 🟡 MEDIUM — Error Stack Traces Exposed to Client

| File                      | Line   | Pattern                                                             |
| ------------------------- | ------ | ------------------------------------------------------------------- |
| `importacao.ts`           | ~700   | `details: errorStack` — full stack trace in JSON response           |
| `importacao.ts`           | ~430   | `details: errorStack`                                               |
| `habilitacoes.ts`         | ~120   | `details: error instanceof Error ? error.message : String(error)`   |
| `qualificacoes/shared.ts` | ~75-80 | Full error message + stack logged, error message returned to client |

**Fix:** In production, return generic error messages. Log details server-side only.

---

## 🟡 MEDIUM — PRAGMA Calls on Every Request

### `ficha360.ts`

Calls `PRAGMA table_info(...)` on **every** request to detect schema at runtime:

```ts
const pragmaHist = await db.prepare("PRAGMA table_info('qualificacoes_historico')").all();
// + PRAGMA for licencas, requisitos_compliance, sessoes_participantes, participantes_sessao
```

### `qualificacoes/historico.ts` — `ensureHistoricoSchema()`

```ts
async function ensureHistoricoSchema(db: D1Database) {
  const col = await db.prepare('PRAGMA table_info(qualificacoes_historico)').all();
  // + potential ALTER TABLE on every request
}
```

### `qualificacoes/tipos.ts` — `qualificacoesTiposHasIsCheck()`

```ts
async function qualificacoesTiposHasIsCheck(db: D1Database): Promise<boolean> {
  const info = await db.prepare("PRAGMA table_info('qualificacoes_tipos')").all();
  // Called on EVERY GET and POST/PUT request
}
```

**Fix:** Cache schema detection results. Schema doesn't change at runtime.

---

## 🟡 MEDIUM — Schema Migration Code in Route Handlers

### `qualificacoes/historico.ts` — `ensureHistoricoSchema()`

### `qualificacoes/historico.ts` — `ensureModelosAeronaveModeloColumn()`

Route handlers contain `ALTER TABLE` statements:

```ts
await db.prepare('ALTER TABLE qualificacoes_historico ADD COLUMN renovada INTEGER DEFAULT 0').run();
```

**Impact:** Migration logic mixed with request handling. If concurrent requests hit this, race conditions can occur.  
**Fix:** Move to proper migration scripts run at deploy time.

---

## 🔵 LOW — Missing HTTP Status Codes

| File               | Route             | Issue                                                                               |
| ------------------ | ----------------- | ----------------------------------------------------------------------------------- |
| `pasta-virtual.ts` | GET /download/:id | Calls `badRequest()` / `notFound()` but doesn't `return` the result — falls through |
| `pasta-virtual.ts` | GET /stream/:id   | Same — `badRequest('ID inválido')` without `return`                                 |
| `pasta-virtual.ts` | DELETE /:id       | Same pattern                                                                        |

```ts
// Bug: missing return
if (isNaN(id)) {
  badRequest('ID inválido'); // ⚠️ Not returned!
}
// Code continues executing with NaN id
```

**Fix:** Add `return` before `badRequest()` / `notFound()` calls.

---

## 🔵 LOW — Unnecessary `Promise.all` Opportunities

| File              | Location                | Sequential Calls That Could Be Parallel                                              |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| `licencas.ts`     | GET /dashboard/licencas | 5 sequential COUNT queries could use Promise.all                                     |
| `ficha360.ts`     | getFicha360             | Multiple independent queries (qualificacoes, licencas, requisitos) could be parallel |
| `notificacoes.ts` | GET /log                | Data query + stats query could be parallel                                           |

---

## 🔵 LOW — Redundant/Dead Code

| File                      | Issue                                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `auditoria.ts`            | Entire file appears to be a debug/one-time audit endpoint with hardcoded CPFs                                                    |
| `auditoria-detalhada.ts`  | Same — debug endpoint                                                                                                            |
| `importacao.ts`           | `/batch-historico-v3` has `debugLogs` array returned in production response                                                      |
| `qualificacoes/shared.ts` | Duplicates `generateETag`, `getCacheTtlMs`, `invalidateMaterializedStats` which are also defined in `qualificacoes/historico.ts` |

---

## 🔵 LOW — Inconsistent Error Handling

| Pattern                                     | Files Using                         |
| ------------------------------------------- | ----------------------------------- |
| `AppError` throws                           | lookup.ts, funcoes.ts, setores.ts   |
| `c.json({ success: false, error })` returns | Most other files                    |
| `badRequest()` / `notFound()` helpers       | licencas.ts, pasta-virtual.ts       |
| `jsonError()` / `jsonOk()`                  | pasta-virtual.ts (legacy endpoints) |
| `safe()` wrapper                            | qualificacoes/\*.ts                 |

**Fix:** Standardize on one pattern (recommend `AppError` + global error handler).

---

## 🔵 LOW — Missing `requireRole()` on Write Operations

| File                         | Route           | Has Auth   | Has Role Check |
| ---------------------------- | --------------- | ---------- | -------------- |
| `licencas.ts`                | POST/PUT/DELETE | ❌ No auth | ❌ No role     |
| `aeronaves.ts`               | POST/PUT/DELETE | ✅ auth()  | ❌ No role     |
| `notificacoes.ts`            | PUT /config/:id | ✅ auth()  | ❌ No role     |
| `qualificacoes/historico.ts` | POST/PUT/DELETE | ✅ auth()  | ❌ No role     |
| `habilitacoes.ts`            | (read only)     | ✅ auth()  | N/A            |

---

## ✅ WELL-IMPLEMENTED FILES

| File                          | Score | Notes                                                                                                                |
| ----------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| `empresas.ts`                 | 8/10  | Proper `auth()` + `tenantMiddleware()` on all routes. Has empresa_id filtering. Minor: `z.any()` usage, console.logs |
| `qualificacoes/atribuicao.ts` | 7/10  | Proper `auth()` + `requireRole()` + Zod validation. Missing: empresa_id filter                                       |
| `qualificacoes/tipos.ts`      | 7/10  | Good Zod schemas, proper RBAC. Minor: `optionalAuth()` on GET, PRAGMA per request                                    |
| `qualificacoes/historico.ts`  | 7/10  | Complex but well-structured. Cache layer, ETag support, audit trail. Missing: empresa_id                             |
| `notificacoes.ts`             | 7/10  | Proper `auth()` on all routes, `requireRole('admin')` on processar. Missing: empresa_id                              |
| `importacao-xlsx.ts`          | 6/10  | Has `auth()` on all routes. Issues: N+1 queries, `any` types, no empresa_id                                          |
| `exportacao.ts`               | 6/10  | Has `auth()`. Issues: `any` types, no empresa_id, no pagination                                                      |
| `funcoes.ts`                  | 6/10  | Has `auth()` + `requireRole()`. Missing: empresa_id                                                                  |
| `setores.ts`                  | 6/10  | Has `auth()` + `requireRole()`. Missing: empresa_id                                                                  |

---

## 📋 PRIORITY FIX LIST

### Sprint 1 (Immediate — Security)

1. Add `auth()` to ALL 11 unprotected route files
2. Add `empresa_id` filter to ALL queries (28 files)
3. Remove `debugLogs` and stack traces from API responses
4. Remove `auditoria.ts` and `auditoria-detalhada.ts` from production (or secure them)
5. Add `requireRole('admin')` to `backup.ts`

### Sprint 2 (High Priority)

6. Replace `optionalAuth()` → `auth()` on all non-public routes
7. Add Zod validation to all write endpoints
8. Fix N+1 queries (compliance.ts, importacao-xlsx.ts, certificados/validacao.ts)
9. Store certificate hash in DB for O(1) lookup instead of O(n) scan
10. Add ownership verification before mutations (frms.ts, licencas.ts, atribuicao.ts)

### Sprint 3 (Medium Priority)

11. Remove ALL `console.log`/`console.error` statements (replace with structured logger)
12. Replace `any` with proper TypeScript types across all files
13. Cache PRAGMA results / move schema migrations to deploy scripts
14. Add pagination to all list endpoints
15. Add missing `deleted_at IS NULL` to queries

### Sprint 4 (Cleanup)

16. Standardize error handling pattern
17. Add `requireRole()` to remaining write endpoints
18. Parallelize independent queries with `Promise.all`
19. Fix `return` missing on `badRequest()`/`notFound()` in pasta-virtual.ts
20. Remove dead code and unused shared module duplicates
