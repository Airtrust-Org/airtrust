# AUDITORIA AIRTRUST — RELATÓRIO COMPLETO

**Data:** 4 de Março de 2026  
**Auditor:** GitHub Copilot (Claude Opus 4.6)  
**Versão do Sistema:** `65da0ae3`  
**Escopo:** Backend (Workers + Hono), Frontend (React 19 + Vite), Banco D1, Storage R2, Segurança, Módulos, Escalabilidade

---

## RESUMO EXECUTIVO

| Categoria                                   | Total    |
| ------------------------------------------- | -------- |
| 🔴 Bugs Críticos                            | **14**   |
| 🟠 Bugs Moderados / Alta Severidade         | **29**   |
| 🟡 Otimizações de Performance               | **18**   |
| 🔵 Limpeza de Código                        | **22**   |
| 🔒 Segurança                                | **12**   |
| 📐 Preparação para Escala                   | **10**   |
| **TOTAL DE ACHADOS**                        | **105**  |
| **Risco global de quebra se não corrigido** | **ALTO** |

---

## 1. 🔴 BUGS CRÍTICOS (Corrigir Imediatamente)

### BUG-001 — JWT Secrets hardcoded no wrangler.toml (SEGURANÇA)

- **Arquivo:** `worker-airtrust/wrangler.toml` (L42, L55, L73-74)
- **Problema:** `JWT_SECRET` de staging e produção, `EDAPP_WEBHOOK_SECRET` e `EDAPP_API_TOKEN` estão em `[vars]` (plaintext, commitado no git) em vez de Cloudflare Secrets.
- **JWT_SECRET produção:** `"prod-secret-jwt-airtrust-2025"` — previsível e fraco.
- **Risco:** Qualquer pessoa com acesso ao repositório pode forjar JWT tokens válidos.
- **Correção:** Executar `wrangler secret put JWT_SECRET --env production`, `wrangler secret put EDAPP_WEBHOOK_SECRET --env production`, etc. Remover de `[vars]` do wrangler.toml. Gerar novos secrets com `openssl rand -base64 64`.

### BUG-002 — X-Debug-Mode expõe stack traces em produção (SEGURANÇA)

- **Arquivo:** `worker-airtrust/src/middleware/error-handler.ts` (L64)
- **Problema:** Qualquer request com header `X-Debug-Mode: true` recebe stack traces completos no JSON de erro, incluindo paths internos, nomes de função e detalhes de implementação.
- **Risco:** Atacante obtém mapa completo da estrutura interna.
- **Correção:** Remover verificação de `X-Debug-Mode` ou restringir a `ENVIRONMENT !== 'production'`.

### BUG-003 — Tenant middleware NUNCA aplicado globalmente (DATA LEAK)

- **Arquivo:** `worker-airtrust/src/index.ts`
- **Problema:** `tenantMiddleware()` é importado (L37) mas **nunca** chamado com `app.use()`. A filtragem por `empresa_id` depende de cada route file implementar manualmente — e a maioria NÃO implementa.
- **Risco:** Dados de todas as empresas são retornados em queries sem filtro de tenant.
- **Correção:** Adicionar `app.use('/api/*', tenantMiddleware())` após `auth()` no middleware chain global (com exceções para `/api/public/*`, `/api/health`, `/api/auth/*`, `/api/assets/*`).

### BUG-004 — /api/templates sem auth nem tenant (DATA LEAK)

- **Arquivo:** `worker-airtrust/src/index.ts` (L802-840)
- **Problema:** Endpoint público que acessa DB diretamente, retorna templates de TODAS as empresas.
- **Correção:** Adicionar `auth()` + filtrar por `empresa_id`.

### BUG-005 — /api/sessoes sem auth nem tenant (DATA LEAK)

- **Arquivo:** `worker-airtrust/src/index.ts` (L844-886)
- **Problema:** Sessões de simulador de TODAS as empresas expostas publicamente.
- **Correção:** Adicionar `auth()` + filtrar por `empresa_id`.

### BUG-006 — FRMS rotas frontend completamente desprotegidas

- **Arquivo:** `src/react-app/App.tsx` (L440-447)
- **Problema:** 8 rotas FRMS (fadiga, escalas, alertas, configurações) sem `<ProtectedRoute>`. Comentário diz "rotas públicas p/ testes" — mas está em produção.
- **Risco:** Dados de fadiga de tripulantes acessíveis sem login.
- **Correção:** Envolver todas as rotas FRMS com `<ProtectedRoute>`.

### BUG-007 — Credenciais hardcoded admin@airtrust.com / Admin@123

- **Arquivos:** `worker-airtrust/src/routes/auth.ts` (L319-328), `src/react-app/context/AuthContext.tsx` (L89-118)
- **Problema:** Bypass de autenticação com credenciais fixas. Se `DEV_AUTH_BYPASS` for `true` em produção, qualquer pessoa faz login como admin.
- **Correção:** Remover credenciais hardcoded do código. Utilizar apenas env vars sem fallback.

### BUG-008 — JWT fallback para secret estático público

- **Arquivo:** `worker-airtrust/src/routes/auth.ts` (L85, L359)
- **Problema:** `const jwtSecret = c.env.JWT_SECRET || 'dev-secret-jwt-airtrust-2025'` — se JWT_SECRET não estiver definido, sistema usa secret público.
- **Correção:** Remover fallback. Fail-fast com `throw new Error('JWT_SECRET not configured')`.

### BUG-009 — backup.ts sem auth — qualquer pessoa pode backup/restore

- **Arquivo:** `worker-airtrust/src/routes/backup.ts`
- **Problema:** Endpoints de backup e restore do banco inteiro acessíveis sem autenticação.
- **Correção:** Adicionar `auth()` + `requireRole('admin')`.

### BUG-010 — dashboard.ts, alertas.ts, licencas.ts, categorias.ts, ficha360.ts sem auth

- **Arquivos:** Múltiplos em `worker-airtrust/src/routes/`
- **Problema:** 6+ arquivos de routes não aplicam `auth()` middleware.
- **Correção:** Adicionar `app.use('*', auth())` no início de cada router.

### BUG-011 — rateLimiter.ts com bug funcional (fail-open)

- **Arquivo:** `worker-airtrust/src/middleware/rateLimiter.ts`
- **Problema:** Usa `c.get('user')` que nunca é setado (auth seta `userId`). Rate limit sempre passa. Também usa `setTimeout()` para GC — inválido em Workers.
- **Correção:** Deletar arquivo. Consolidar em `rate-limit.ts` único.

### BUG-012 — FRMS sem NENHUM audit logging

- **Arquivo:** `worker-airtrust/src/routes/frms.ts` (4000+ linhas)
- **Problema:** Zero chamadas a `registrarAuditoria` ou `auditoria_avancada_v2`. Jornadas, escalas, alertas de fadiga são alterados sem rastro.
- **Risco:** Compliance regulatória — FRMS é módulo de segurança de voo.
- **Correção:** Adicionar `registrarAuditoria` em todas as operações C/U/D.

### BUG-013 — Pasta Virtual sem NENHUM audit logging

- **Arquivo:** `worker-airtrust/src/routes/pasta-virtual.ts` (1125 linhas)
- **Problema:** Upload e delete de documentos regulatórios sem rastreio.
- **Correção:** Adicionar `registrarAuditoria` em upload/delete.

### BUG-014 — react-hot-toast silenciosamente quebrado

- **Arquivo:** `package.json` + 8+ componentes
- **Problema:** App.tsx monta `<Toaster>` do `sonner` mas **nunca** monta `<Toaster>` do `react-hot-toast`. Todas as chamadas `toast()` do react-hot-toast em 8+ arquivos **não renderizam** — feedback ao usuário perdido.
- **Correção:** Migrar todos os `import { toast } from 'react-hot-toast'` para `import { toast } from 'sonner'`. Remover `react-hot-toast` do `package.json`.

---

## 2. 🟠 BUGS MODERADOS (Corrigir no Próximo Ciclo)

### MOD-001 — 3 arquivos de rate limit duplicados

- **Arquivos:** `rate-limit.ts`, `rateLimit.ts`, `rateLimiter.ts`
- **Impacto:** Confusão, bug funcional no rateLimiter.ts, setTimeout inválido.
- **Correção:** Consolidar em `rate-limit.ts`. Deletar os outros dois.

### MOD-002 — CORS handler duplicado em index.ts

- **Arquivo:** `worker-airtrust/src/index.ts` (L119-137)
- **Problema:** Handler catch-all de OPTIONS duplica lógica do cors.ts middleware.
- **Correção:** Remover duplicata, usar apenas o middleware.

### MOD-003 — cors.ts faz fallback para localhost quando origin não permitida

- **Arquivo:** `worker-airtrust/src/middleware/cors.ts` (L28-30)
- **Problema:** Em vez de rejeitar CORS, faz fallback para `http://localhost:3000`.
- **Correção:** Omitir header se origin não for permitida.

### MOD-004 — no-cache.ts seta CORS `*` como fallback

- **Arquivo:** `worker-airtrust/src/middleware/no-cache.ts` (L28)
- **Problema:** Se `ENVIRONMENT` não estiver definido, expõe CORS wildcard.
- **Correção:** Verificar `!== 'production'` explicitamente.

### MOD-005 — Queries sem `deleted_at IS NULL` em ~20 rotas

- **Arquivos:** Múltiplos em `worker-airtrust/src/routes/`
- **Problema:** Registros soft-deleted são incluídos em resultados de listagem.
- **Correção:** Audit de todas as queries SELECT e adicionar filtro.

### MOD-006 — ~21 tabelas de negócio sem `empresa_id` (multi-tenant incompleto)

- **Arquivo:** `worker-airtrust/schema.sql`
- **Problema:** Multi-tenant parcialmente implementado. Tabelas como `documentos`, `habilitacoes`, `licencas` não filtram por empresa.
- **Correção:** Adicionar `empresa_id` e migrar dados existentes.

### MOD-007 — `usuarios.deleted_at` default é `INTEGER DEFAULT 1`

- **Arquivo:** `worker-airtrust/schema.sql`
- **Problema:** Todos os usuários novos nascem com `deleted_at = 1` (truthy), o que pode fazer query `WHERE deleted_at IS NULL` falhar.
- **Correção:** Migration para `DEFAULT NULL`.

### MOD-008 — `licencas.funcionario_id` é TEXT mas `funcionarios.id` é INTEGER

- **Arquivo:** `worker-airtrust/schema.sql`
- **Problema:** Type mismatch em FK — JOINs podem falhar silenciosamente no SQLite.
- **Correção:** Migration para normalizar tipos.

### MOD-009 — 10 tabelas com FK para tabelas fantasma (backup)

- **Arquivo:** `worker-airtrust/schema.sql`
- **Problema:** FKs apontam para `__backup_pessoas` e `funcionarios_backup` que não existem.
- **Correção:** Remover FKs obsoletas via migration.

### MOD-010 — `qualificacoes_historico` sem FK constraints

- **Arquivo:** `worker-airtrust/schema.sql`
- **Problema:** `funcionario_id` é nullable e sem FK — dados órfãos possíveis.
- **Correção:** Adicionar FK constraint.

### MOD-011 — INSERTs em `auditoria_avancada_v2` com schema inconsistente

- **Arquivos:** simuladores.ts (usa `tabela`/`registro_id`), funcionarios.ts (usa `entidade`/`entidade_id`)
- **Problema:** 3 padrões diferentes de audit no codebase.
- **Correção:** Unificar em `registrarAuditoria()` em todos os módulos.

### MOD-012 — Simuladores audit sem user/IP/user-agent

- **Arquivo:** `worker-airtrust/src/routes/simuladores.ts` (função `audit()` local)
- **Problema:** Função `audit()` insere em `auditoria_avancada_v2` mas sem `usuario_id`, `ip_address`, `user_agent`.
- **Correção:** Substituir por `registrarAuditoria()` padrão.

### MOD-013 — parseInt sem validação de range em queries

- **Arquivo:** `worker-airtrust/src/index.ts` (L805, L847-848)
- **Problema:** `parseInt(c.req.query('limit'))` aceita negativos ou valores extremos.
- **Correção:** Clampar: `Math.min(Math.max(parseInt(limit) || 20, 1), 100)`.

### MOD-014 — /api/public/translate sem rate limiting

- **Arquivo:** `worker-airtrust/src/index.ts` (L220-297)
- **Problema:** Proxy aberto para Google Translate. Limitado a 500 chars mas sem rate limit.
- **Correção:** Adicionar rate limiting de 30 req/min/IP.

### MOD-015 — Rotas duplicadas /api/qualificacoes e /api/qualificacoes/

- **Arquivo:** `worker-airtrust/src/index.ts` (L626-668)
- **Problema:** Copy-paste de código idêntico para com e sem trailing slash.
- **Correção:** Usar `app.get('/api/qualificacoes{/}?', handler)` ou normalizar trailing slash.

### MOD-016 — Error responses vazam stack traces

- **Arquivos:** `qualificacoes-certificados.ts` (L756), `empresas.ts` (~L520), `pasta-virtual.ts` (L695)
- **Problema:** `error.stack` e `error.message` detalhados retornados no JSON.
- **Correção:** Retornar mensagem genérica. Logar detalhes internamente.

### MOD-017 — pasta-virtual.ts retorna sem `return` em error handlers

- **Arquivo:** `worker-airtrust/src/routes/pasta-virtual.ts`
- **Problema:** Código continua executando após enviar response de erro.
- **Correção:** Adicionar `return` antes de `c.json(...)` em catch blocks.

### MOD-018 — validação de certificate hash O(n) em vez de O(1)

- **Arquivo:** `worker-airtrust/src/routes/certificados/validacao.ts`
- **Problema:** Carrega 1000 certificados e faz hash de cada um por request, em vez de query por hash.
- **Correção:** Armazenar hash na tabela e fazer `SELECT WHERE hash = ?`.

### MOD-019 — Global window.fetch monkey-patch (210 linhas)

- **Arquivo:** `src/react-app/main.tsx` (L48-260)
- **Problema:** Substitui fetch global com caching/dedup/backoff que conflita com retry do httpClient.
- **Risco:** Double/triple retry, dados stale servidos por cache.
- **Correção:** Migrar lógica para interceptor do httpClient. Remover monkey-patch.

### MOD-020 — 5+ API clients concorrentes no frontend

- **Arquivos:** `http-client.ts`, `api-adapter.ts`, `api.ts`, `apiClient.ts`, `utils/api-client.ts`, `fichasApi.ts`, `relatoriosSimuladoresApi.ts`, `config/api.ts`, `hooks/useApi.ts`
- **Problema:** Token injection duplicada 6+ vezes, retry em 4 lugares, error handling inconsistente.
- **Correção:** Consolidar em `httpClient` único. Deletar `utils/api-client.ts` (452 LOC órfão).

### MOD-021 — Token stored em localStorage (XSS risk)

- **Arquivos:** `AuthContext.tsx`, `http-client.ts`, `fichasApi.ts`, `useApi.ts`, `relatoriosSimuladoresApi.ts`
- **Problema:** JWT em localStorage é exfiltrável via XSS.
- **Correção:** Migrar para httpOnly cookie ou in-memory token store.

### MOD-022 — 6 keys diferentes de localStorage para token

- **Arquivo:** `src/react-app/services/http-client.ts` (L64-67)
- **Problema:** Scannea `airtrust_token`, `token`, `auth_token`, `accessToken`, `access_token`, `airtrust_access_token`.
- **Correção:** Usar apenas `airtrust_token` via `getAccessToken()`.

### MOD-023 — Ficheiros órfãos no R2 (sem rollback no catch)

- **Arquivos:** `pasta-virtual.ts` (L646-680), `qualificacoes-certificados.ts` (L660-680)
- **Problema:** Se INSERT no D1 falhar após PUT no R2, o objeto fica órfão.
- **Correção:** Adicionar `bucket.delete(key)` no catch.

### MOD-024 — Delete físico imediato no R2 (sem grace period)

- **Arquivo:** `worker-airtrust/src/routes/pasta-virtual.ts` (L278-310)
- **Problema:** Soft delete no D1 + delete físico no R2 simultâneo. Se soft delete for revertido, arquivo perdido.
- **Correção:** Não deletar R2 imediatamente. Usar lifecycle policy ou cron de limpeza após 90 dias.

### MOD-025 — /api/assets/ sem auth (qualquer arquivo R2 público)

- **Arquivo:** `worker-airtrust/src/routes/assets.ts`
- **Problema:** Qualquer arquivo no bucket R2 é servido publicamente via `/api/assets/:folder/:filename`.
- **Nota:** Propositalmente público para logos. Mas certificados e documentos regulatórios também ficam expostos se alguém souber o path.
- **Correção:** Restringir a folders permitidos (apenas `logos/`) ou adicionar auth para outros folders.

### MOD-026 — CORS wildcard no endpoint de stream

- **Arquivo:** `worker-airtrust/src/routes/pasta-virtual.ts` (L808)
- **Problema:** `Access-Control-Allow-Origin: *` no streaming de documentos.
- **Correção:** Usar origins permitidas do cors middleware.

### MOD-027 — Inconsistência de roles RBAC

- **Arquivos:** `rbac.ts` (lowercase: `admin|manager|user`), `auth.ts` (UPPERCASE: `ADMIN`), `tenant.ts` (mixed: `admin|manager|editor|viewer|instructor|student`)
- **Problema:** Roles nunca matcham entre os sistemas.
- **Correção:** Unificar enum de roles.

### MOD-028 — SQL concatenation em tenant.ts (injection risk)

- **Arquivo:** `worker-airtrust/src/middleware/tenant.ts` (L277-283, L303-313)
- **Problema:** `withTenantFilter()` e `verifyRecordOwnership()` usam string interpolation para SQL.
- **Correção:** Usar parâmetros bound (`?`).

### MOD-029 — FrmsDashboard importado eagerly (não lazy)

- **Arquivo:** `src/react-app/App.tsx` (L8)
- **Problema:** 1192 linhas carregadas no bundle principal.
- **Correção:** `const FrmsDashboard = lazyWithRetry(...)`.

---

## 3. 🟡 OTIMIZAÇÕES DE PERFORMANCE

| #       | Otimização                                                     | Impacto   | Arquivo                   |
| ------- | -------------------------------------------------------------- | --------- | ------------------------- |
| OPT-001 | Consolidar 5 API clients em 1                                  | **ALTO**  | frontend services/        |
| OPT-002 | Remover window.fetch monkey-patch                              | **ALTO**  | main.tsx                  |
| OPT-003 | Lazy-load FrmsDashboard (1192 LOC)                             | **MÉDIO** | App.tsx                   |
| OPT-004 | Remover axios (~30KB), react-pdf (~200KB), xlsx analisar uso   | **ALTO**  | package.json              |
| OPT-005 | Remover react-hot-toast (~15KB)                                | **BAIXO** | package.json              |
| OPT-006 | Certificate validation O(1) em vez de O(n) hash                | **ALTO**  | certificados/validacao.ts |
| OPT-007 | Implementar Cache API/KV para lookups estáticos                | **ALTO**  | worker middleware         |
| OPT-008 | Cursor-based pagination em tabelas >10k registros              | **MÉDIO** | todos os routes           |
| OPT-009 | Promise.all para queries independentes no dashboard            | **MÉDIO** | dashboard.ts              |
| OPT-010 | Implementar Cloudflare Queues para PDF/importação              | **ALTO**  | simuladores, importação   |
| OPT-011 | ~20 índices duplicados no D1                                   | **MÉDIO** | schema.sql                |
| OPT-012 | Auth middleware faz query DB em cada request (dev bypass)      | **BAIXO** | middleware/auth.ts        |
| OPT-013 | 14 tabelas backup/legado/tmp a limpar                          | **BAIXO** | schema.sql                |
| OPT-014 | `qualificacoes_historico` sem index em `empresa_id`            | **ALTO**  | schema.sql                |
| OPT-015 | Remover `process.uptime()` (não existe em Workers)             | **BAIXO** | index.ts L362             |
| OPT-016 | Guard cron tasks por `event.cron` (evitar execução redundante) | **MÉDIO** | index.ts scheduled        |
| OPT-017 | Purge scheduled incompleto (só 5 tabelas de 13+)               | **MÉDIO** | index.ts scheduled        |
| OPT-018 | Cache-Control `public, max-age=300` em dados autenticados      | **MÉDIO** | middleware/cache.ts       |

---

## 4. 🔵 LIMPEZA DE CÓDIGO

| #       | Item                                                                              | Arquivo(s)                                                                                                     |
| ------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| CLN-001 | Remover `rateLimiter.ts` e `rateLimit.ts` (duplicatas)                            | middleware/                                                                                                    |
| CLN-002 | Remover `utils/api-client.ts` (452 LOC órfão no frontend)                         | src/react-app/utils/                                                                                           |
| CLN-003 | Remover `api-adapter.ts`, `api.ts`, `apiClient.ts` (deprecated wrappers)          | services/                                                                                                      |
| CLN-004 | Remover service duplicados: `qualificacoes.service.ts`, `qualificacoesService.ts` | services/                                                                                                      |
| CLN-005 | 40+ `console.log` em componentes de produção                                      | 15+ componentes React                                                                                          |
| CLN-006 | 20+ `console.log` em routes de produção                                           | 15+ route files                                                                                                |
| CLN-007 | `logger.ts` middleware nunca usado (dead code)                                    | middleware/logger.ts                                                                                           |
| CLN-008 | `response.ts` wrap() nunca usado                                                  | middleware/response.ts                                                                                         |
| CLN-009 | Migrations SQL hardcoded em index.ts (600+ linhas)                                | index.ts L950-1590                                                                                             |
| CLN-010 | Dois padrões de nomenclatura R2 concorrentes                                      | utils/certificate-naming.ts + nomenclatura-padronizada.ts                                                      |
| CLN-011 | Dual toast libraries (sonner + react-hot-toast)                                   | package.json                                                                                                   |
| CLN-012 | Dual DnD libraries (@hello-pangea/dnd + @dnd-kit)                                 | package.json                                                                                                   |
| CLN-013 | Dual virtualization (react-window + @tanstack/react-virtual)                      | package.json                                                                                                   |
| CLN-014 | `@types/react-router-dom` v5 com react-router v7                                  | package.json                                                                                                   |
| CLN-015 | 6 componentes com 1000+ linhas que precisam split                                 | Qualificacoes, ModalFuncionario, FrmsImportacaoFira, FrmsDashboard, DashboardPrincipal, CalendarioAgendamentos |
| CLN-016 | X-Dev-Auth-Bypass no CORS allowed headers                                         | middleware/cors.ts                                                                                             |
| CLN-017 | Types inline em routes (Documento em pasta-virtual.ts)                            | routes/                                                                                                        |
| CLN-018 | `any` usage em 20+ locais no frontend                                             | services/, pages/                                                                                              |
| CLN-019 | `any` usage em 15+ locais no backend                                              | routes/                                                                                                        |
| CLN-020 | `@ts-expect-error` em auth middleware (5 ocorrências)                             | middleware/auth.ts                                                                                             |
| CLN-021 | Schemas Zod duplicados (schemas/index.ts vs funcionarios.service.ts)              | schemas/, services/                                                                                            |
| CLN-022 | DevTools blocker em dev mode (bloqueia F12)                                       | main.tsx (L283-321)                                                                                            |

---

## 5. 🔒 SEGURANÇA

| #       | Item                                                  | Severidade | Status                 |
| ------- | ----------------------------------------------------- | ---------- | ---------------------- |
| SEC-001 | JWT_SECRET hardcoded + previsível no wrangler.toml    | 🔴 CRÍTICO | ❌ NÃO RESOLVIDO       |
| SEC-002 | X-Debug-Mode expõe stack traces para qualquer request | 🔴 CRÍTICO | ❌ NÃO RESOLVIDO       |
| SEC-003 | Dev auth bypass com credenciais hardcoded             | 🔴 CRÍTICO | ❌ NÃO RESOLVIDO       |
| SEC-004 | JWT fallback para secret estático público             | 🟠 ALTO    | ❌ NÃO RESOLVIDO       |
| SEC-005 | 6+ rotas backend sem autenticação                     | 🟠 ALTO    | ❌ NÃO RESOLVIDO       |
| SEC-006 | Backup/Restore sem auth (database dump exposure)      | 🔴 CRÍTICO | ❌ NÃO RESOLVIDO       |
| SEC-007 | Rate limit in-memory (não distribuído, resetável)     | 🟡 MÉDIO   | ⚠️ PARCIAL             |
| SEC-008 | IDs sequenciais numéricos (enumeração)                | 🟡 MÉDIO   | ❌ NÃO RESOLVIDO       |
| SEC-009 | localStorage para JWT tokens (XSS risk)               | 🟠 ALTO    | ❌ NÃO RESOLVIDO       |
| SEC-010 | SQL concatenation em tenant middleware                | 🟠 ALTO    | ❌ NÃO RESOLVIDO       |
| SEC-011 | CORS wildcard em endpoint de stream                   | 🟡 MÉDIO   | ❌ NÃO RESOLVIDO       |
| SEC-012 | CSP inclui `unsafe-inline` + `unsafe-eval`            | 🟡 MÉDIO   | ⚠️ NECESSÁRIO PARA SPA |

---

## 6. 📐 PLANO DE ESCALA — PRIORIZADO

### Fase 1: Segurança Imediata (1-2 dias)

| #   | Ação                                                                     | Impacto     |
| --- | ------------------------------------------------------------------------ | ----------- |
| 1.1 | Mover JWT_SECRET e API tokens para `wrangler secret put`                 | **CRÍTICO** |
| 1.2 | Remover X-Debug-Mode do error handler                                    | **CRÍTICO** |
| 1.3 | Remover credenciais hardcoded e JWT fallback                             | **CRÍTICO** |
| 1.4 | Adicionar auth em rotas desprotegidas (backup, dashboard, alertas, etc.) | **CRÍTICO** |
| 1.5 | Aplicar tenantMiddleware globalmente em `/api/*`                         | **CRÍTICO** |

### Fase 2: Integridade de Dados (3-5 dias)

| #   | Ação                                                           | Impacto   |
| --- | -------------------------------------------------------------- | --------- |
| 2.1 | Adicionar `registrarAuditoria` em FRMS (todas operações C/U/D) | **ALTO**  |
| 2.2 | Adicionar `registrarAuditoria` em Pasta Virtual                | **ALTO**  |
| 2.3 | Unificar 3 padrões de audit em `registrarAuditoria()` único    | **ALTO**  |
| 2.4 | Adicionar `deleted_at IS NULL` em ~20 queries faltantes        | **ALTO**  |
| 2.5 | Fix `usuarios.deleted_at DEFAULT 1` → `DEFAULT NULL`           | **ALTO**  |
| 2.6 | Fix type mismatch `licencas.funcionario_id` TEXT → INTEGER     | **MÉDIO** |
| 2.7 | Adicionar rollback R2 no catch de uploads                      | **MÉDIO** |

### Fase 3: Limpeza & Consolidação (1 semana)

| #   | Ação                                                     | Impacto   |
| --- | -------------------------------------------------------- | --------- |
| 3.1 | Consolidar 3 rate-limit em 1 arquivo                     | **MÉDIO** |
| 3.2 | Consolidar 5+ API clients do frontend em 1               | **ALTO**  |
| 3.3 | Remover monkey-patch de window.fetch                     | **ALTO**  |
| 3.4 | Migrar react-hot-toast → sonner                          | **MÉDIO** |
| 3.5 | Remover dependências não usadas (axios, react-pdf, etc.) | **MÉDIO** |
| 3.6 | Remover 55+ console.log de produção                      | **BAIXO** |
| 3.7 | Unificar roles RBAC (admin/manager/user)                 | **MÉDIO** |

### Fase 4: Performance & Cache (1-2 semanas)

| #   | Ação                                                           | Impacto   |
| --- | -------------------------------------------------------------- | --------- |
| 4.1 | Implementar KV cache para lookups (categorias, tipos, configs) | **ALTO**  |
| 4.2 | Cursor-based pagination em tabelas grandes                     | **MÉDIO** |
| 4.3 | Índice em `qualificacoes_historico.empresa_id`                 | **ALTO**  |
| 4.4 | Remover ~20 índices duplicados                                 | **MÉDIO** |
| 4.5 | Certificado validation hash O(1)                               | **ALTO**  |
| 4.6 | Lazy-load FrmsDashboard + split componentes 1000+ LOC          | **MÉDIO** |

### Fase 5: Escala & Resiliência (2-4 semanas)

| #   | Ação                                                     | Impacto   |
| --- | -------------------------------------------------------- | --------- |
| 5.1 | Split worker monolítico em 4-5 domain workers            | **ALTO**  |
| 5.2 | Cloudflare Queues para PDF, importação, compliance batch | **ALTO**  |
| 5.3 | Durable Objects para rate limiting distribuído           | **MÉDIO** |
| 5.4 | Structured JSON logging + Logpush/Sentry                 | **MÉDIO** |
| 5.5 | Testes automatizados para top 10 critical flows          | **ALTO**  |

---

## 7. MÓDULOS COM FLUXO INCOMPLETO

| Módulo            | CRUD           | Soft Delete           | Audit          | Tenant     | Status                 |
| ----------------- | -------------- | --------------------- | -------------- | ---------- | ---------------------- |
| Funcionários      | ✅             | ✅                    | ✅             | ⚠️ Parcial | **BOM**                |
| Qualificações     | ✅             | ✅                    | ⚠️ 3 padrões   | ⚠️ Parcial | **MÉDIO**              |
| Simuladores       | ✅             | ⚠️ Parcial            | ⚠️ Sem user/IP | ⚠️ Parcial | **MÉDIO**              |
| **FRMS**          | ✅             | ✅                    | **❌ ZERO**    | ✅         | **RUIM**               |
| **Pasta Virtual** | ✅             | ⚠️ R2 delete imediato | **❌ ZERO**    | ❌         | **RUIM**               |
| Compliance        | ✅ (read-only) | N/A                   | ⚠️ Só batch    | ❌         | **MÉDIO**              |
| Certificados      | ✅             | ✅                    | ✅             | ⚠️ Parcial | **BOM**                |
| Licenças          | ✅             | ✅                    | ✅             | ❌         | **MÉDIO**              |
| Aeronaves         | ✅             | ✅                    | ✅             | ⚠️         | **BOM**                |
| Empresas          | ✅             | ✅                    | ✅             | N/A        | **BOM**                |
| **Backup**        | ✅             | N/A                   | ❌             | ❌         | **CRÍTICO** — Sem auth |
| **Dashboard**     | ✅ (read)      | N/A                   | N/A            | ❌         | **CRÍTICO** — Sem auth |

---

## 8. COBERTURA DE TESTES

| Área                   | Testes Existentes | Necessários | Gap     |
| ---------------------- | ----------------- | ----------- | ------- |
| Auth/RBAC              | 0                 | 10+         | 🔴      |
| FRMS cálculos          | 2                 | 8+          | 🟡      |
| Compliance             | 1                 | 5+          | 🟡      |
| Simuladores E2E        | 0                 | 8+          | 🔴      |
| Multi-tenant isolation | 0                 | 5+          | 🔴      |
| Upload/Download R2     | 0                 | 5+          | 🔴      |
| Importação XLSX        | 0                 | 5+          | 🔴      |
| Cron jobs              | 0                 | 4+          | 🟡      |
| Soft delete/purge      | 0                 | 3+          | 🟡      |
| Qualificação → Alerta  | 0                 | 5+          | 🔴      |
| **TOTAL**              | **3**             | **~60**     | **<5%** |

---

## 9. CRON — PROBLEMAS IDENTIFICADOS

| #        | Problema                                                              | Severidade |
| -------- | --------------------------------------------------------------------- | ---------- |
| CRON-001 | Tasks rodam redundantemente em todos os 5 triggers cron (exceto FRMS) | 🟡 MÉDIO   |
| CRON-002 | Sem dead-letter/retry em caso de falha                                | 🟡 MÉDIO   |
| CRON-003 | Sem health-check persistido (apenas console.log)                      | 🟡 MÉDIO   |
| CRON-004 | Purge soft-delete incompleto (5 de 13+ tabelas)                       | 🟡 MÉDIO   |
| CRON-005 | FRMS cron não registra execução em auditoria                          | 🟡 MÉDIO   |

---

## 10. ✅ O QUE NÃO TOCAR (Funcionando Bem)

| Item                                      | Motivo                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| **Auth JWT flow** (auth.ts middleware)    | Implementação com `jose` é segura. Token verification correto.            |
| **Funcionários CRUD + Audit**             | Fluxo completo, soft delete, `registrarAuditoria` com dados antes/depois. |
| **Qualificações módulo** (5 sub-arquivos) | Boa modularização. Mantém histórico, atribuição, renovação.               |
| **FRMS cálculos científicos**             | Algoritmo de acúmulo rolling/mensal/frota está correto e testado.         |
| **FRMS FIRA parser**                      | Parse de PDF FIRA funcional e testado.                                    |
| **Simuladores conflict detection**        | `findSessaoConflict()` detecta sobreposição de horários corretamente.     |
| **Certificados geração PDF**              | Template + PDF generation funcional. Nomenclatura auditável.              |
| **Deploy pipeline**                       | `deploy-full-automated.sh` com guard + smoke test é robusto.              |
| **Assets route order**                    | Guard script previne regressão de auth em `/api/assets`.                  |
| **R2 streaming**                          | `/api/pasta-virtual/stream/:id` com auth funciona corretamente.           |
| **Empresa logo upload**                   | Fluxo corrigido recentemente, testado em produção.                        |
| **Validation via QR Code**                | Certificado validation via hash funcional (mas lento — ver OPT).          |
| **Backup automático**                     | Cron backup diário/semanal/mensal com orquestrador funcional.             |
| **Multi-tenant context**                  | `AuthContext` com `empresaAtualId` + refresh funcional.                   |

---

## APÊNDICE A: ARQUITETURA ATUAL

```
┌─────────────────────────────────────────────────┐
│              Frontend (Pages)                     │
│    React 19 + Vite 6 + Tailwind + TypeScript     │
│    Deploy: Cloudflare Pages (airtrust.online)     │
├─────────────────────────────────────────────────┤
│              API (Worker)                         │
│    Hono v4 + TypeScript                           │
│    1 Worker monolítico (1975 LOC index.ts)        │
│    30+ route modules (~15000 LOC total)           │
│    Deploy: workers.dev                            │
├─────────────────────────────────────────────────┤
│   D1 (SQLite)  │  R2 (Files)  │  Cron (3 jobs)  │
│   ~117 tabelas  │  Logos/Certs  │  Notif/FRMS/BKP │
│   ~55 ativas    │  Documentos   │                  │
│   13.22 MB      │               │                  │
└─────────────────────────────────────────────────┘
```

## APÊNDICE B: DEPENDÊNCIAS FRONTEND — ANÁLISE

| Dependência                     | Tamanho     | Status                                                 |
| ------------------------------- | ----------- | ------------------------------------------------------ |
| `xlsx`                          | ~400KB      | ⚠️ Verificar se pode usar papaparse no lugar           |
| `react-pdf`                     | ~200KB      | ⚠️ 0 imports encontrados — provavelmente não usado     |
| `axios`                         | ~30KB       | ❌ 0 imports — REMOVER                                 |
| `react-hot-toast`               | ~15KB       | ❌ Silenciosamente quebrado — REMOVER                  |
| `@hello-pangea/dnd`             | ~50KB       | ⚠️ Usado em 1 arquivo, duplica @dnd-kit                |
| `react-window`                  | ~10KB       | ⚠️ Usado em 1 arquivo, duplica @tanstack/react-virtual |
| `html2canvas`                   | ~200KB      | ⚠️ Verificar uso                                       |
| **Total desperdiçado estimado** | **~500KB+** |                                                        |

## APÊNDICE C: TOP 10 FLUXOS PARA TESTES AUTOMATIZADOS

| #   | Fluxo                                                     | Risco se Quebrar            |
| --- | --------------------------------------------------------- | --------------------------- |
| 1   | Auth login → JWT → refresh → RBAC enforcement             | Acesso não autorizado       |
| 2   | Qualificação atribuir → vencimento → alerta → notificação | Compliance regulatória      |
| 3   | FRMS jornada → acúmulo → alerta fadiga                    | Segurança de voo            |
| 4   | Simulador sessão → ficha → notas → gerar qualificação     | Integridade de certificação |
| 5   | Pasta Virtual upload → R2 → download/stream               | Documentos perdidos         |
| 6   | Compliance recalculate batch                              | Status incorreto            |
| 7   | Multi-tenant isolation (Empresa A ≠ Empresa B)            | Vazamento de dados          |
| 8   | Importação XLSX → funcionários + qualificações            | Dados corrompidos           |
| 9   | Cron: notificações + FRMS daily + backup                  | Jobs silenciosamente falham |
| 10  | Soft delete + purge 90 dias                               | Dados perdidos ou zombies   |

---

_Relatório gerado automaticamente. Cada item deve ser priorizado pela equipa de desenvolvimento conforme a matriz de risco e impacto no negócio._
