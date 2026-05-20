# Relatório de Correções — Auditoria Completa AirTrust

**Data**: 4 de Março de 2026  
**Commit backup (pré-correções)**: `7a5b9a1f`  
**Commit 1ª rodada**: `cd30647a` | Worker `304df901`  
**Commit 2ª rodada**: `68a9cb5b` | Worker `50d648fb`  
**Status**: ✅ Deployed em produção (ambas as rodadas)

---

## Resumo Executivo

**1ª rodada**: 25 correções em 22 arquivos (22 modificados, 3 deletados), cobrindo segurança, autenticação, rate limiting, migração de bibliotecas, auditoria e limpeza de código.

**2ª rodada**: 12 correções adicionais identificadas em análise de gaps — JWT secrets, auth em 8 rotas desprotegidas, schema de auditoria e bug crítico de soft delete em usuários.

---

## 1. SEGURANÇA (5 correções)

### 1.1 X-Debug-Mode Stack Trace Leak (CRÍTICO)

- **Arquivo**: `worker-airtrust/src/middleware/error-handler.ts`
- **Problema**: Header `X-Debug-Mode: true` habilitava stack trace completo em qualquer requisição, mesmo sem autenticação
- **Correção**: Removido check de `X-Debug-Mode`. Agora só verifica `c.env?.ENVIRONMENT === 'development' || 'staging'`
- **Impacto**: Impede exposição de caminhos internos e mensagens de erro detalhadas a atacantes

### 1.2 SQL Injection em tenant.ts — withTenantFilter (CRÍTICO)

- **Arquivo**: `worker-airtrust/src/middleware/tenant.ts`
- **Problema**: `withTenantFilter()` usava string interpolation `${empresaId}` direto no SQL
- **Correção**: Agora retorna `WHERE empresa_id = ?` (placeholder). Caller deve adicionar empresaId como bind param
- **Nota**: Função não é chamada por nenhuma rota atualmente (todas fazem filtering manual), mas fica segura para uso futuro

### 1.3 SQL Injection em tenant.ts — verifyRecordOwnership (CRÍTICO)

- **Arquivo**: `worker-airtrust/src/middleware/tenant.ts`
- **Problema**: Parâmetro `table` era interpolado diretamente no SQL sem validação
- **Correção**: Adicionada whitelist `ALLOWED_TABLES` (23 tabelas). Lança `AppError` se tabela não estiver na lista

### 1.4 CORS Wildcard em no-cache.ts

- **Arquivo**: `worker-airtrust/src/middleware/no-cache.ts`
- **Problema**: Adicionava `Access-Control-Allow-Origin: *` condicionalmente, conflitando com cors.ts
- **Correção**: Removidos 3 blocos de headers CORS. Delegado ao middleware cors.ts centralizado

### 1.5 CORS Wildcard em pasta-virtual.ts

- **Arquivo**: `worker-airtrust/src/routes/pasta-virtual.ts`
- **Problema**: Endpoint de streaming de PDF retornava `Access-Control-Allow-Origin: *`
- **Correção**: Removidos headers CORS manuais. Delegado ao middleware global

---

## 2. AUTENTICAÇÃO (3 correções)

### 2.1 /api/templates sem autenticação

- **Arquivo**: `worker-airtrust/src/index.ts`
- **Problema**: Rota `/api/templates` acessível sem token JWT
- **Correção**: Adicionado `auth()` middleware + validação com parseInt seguro (clamp min=1, max=200)

### 2.2 /api/sessoes sem autenticação

- **Arquivo**: `worker-airtrust/src/index.ts`
- **Problema**: Rota `/api/sessoes` acessível sem token JWT
- **Correção**: Adicionado `auth()` middleware + validação com parseInt seguro

### 2.3 FRMS Frontend — Rotas Desprotegidas (CRÍTICO)

- **Arquivo**: `src/react-app/App.tsx`
- **Problema**: 8 rotas FRMS (`/frms`, `/frms/tripulante/:id`, etc.) marcadas como "rotas públicas p/ testes" sem `<ProtectedRoute>`
- **Correção**: Todas as 8 rotas agora envolvidas em `<ProtectedRoute>`. FrmsDashboard convertido para lazy loading via `lazyWithRetry()`

---

## 3. RATE LIMITING (3 correções)

### 3.1 Consolidação de 3 rate limiters em 1

- **Arquivos deletados**: `middleware/rateLimiter.ts` (BROKEN), `middleware/rateLimit.ts` (duplicata)
- **Arquivo canonical**: `middleware/rate-limit.ts` (mantido, era o correto)
- **Problema principal**: `rateLimiter.ts` usava `c.get('user')` que nunca é setado, fazendo rate limit SEMPRE PASSAR (fail-open). Também usava `setTimeout()` que não existe em Workers.

### 3.2 Atualização frms.ts (7 call sites)

- **Arquivo**: `worker-airtrust/src/routes/frms.ts`
- **De**: `rateLimiter({ limit: N, windowMs: M })` (interface do arquivo broken)
- **Para**: `rateLimiter({ maxRequests: N, windowSeconds: M/1000, keyPrefix: 'frms-...' })` (interface correta)

### 3.3 Atualização auth.ts (1 call site)

- **Arquivo**: `worker-airtrust/src/routes/auth.ts`
- **De**: `rateLimit({ windowMs: 60000, max: 10 })` (interface da duplicata)
- **Para**: `rateLimiter({ maxRequests: 10, windowSeconds: 60, keyPrefix: 'auth-login' })` (interface correta)

---

## 4. MIGRAÇÃO react-hot-toast → sonner (11 correções)

### 4.1 Reescrita utils/toast.ts

- **Arquivo**: `src/react-app/utils/toast.ts`
- **De**: `import toast from 'react-hot-toast'` com inline styles para cada toast
- **Para**: `import { toast } from 'sonner'` com API nativa (Sonner já estava montado no App.tsx via `<Toaster>`)

### 4.2 Migração de imports (9 arquivos)

Todos alterados de `import { toast } from 'react-hot-toast'` para `import { toast } from 'sonner'`:

| Arquivo                                               | Tipo de import        |
| ----------------------------------------------------- | --------------------- |
| `pages/PastaVirtual.tsx`                              | `{ toast }`           |
| `pages/simuladores/dashboard/DashboardDesempenho.tsx` | `{ toast }`           |
| `pages/funcionarios/ListaDocumentos.tsx`              | `{ toast }`           |
| `pages/funcionarios/UploadDocumentos.tsx`             | `{ toast }`           |
| `pages/qualificacoes/FormularioQualificacao.tsx`      | `{ toast }`           |
| `hooks/useQualificacoesExt.ts`                        | `{ toast }`           |
| `components/ExportButton.tsx`                         | `default → { toast }` |
| `components/certificados/UploadCertificado.tsx`       | `{ toast }`           |
| `components/UploadDocumentosPastaVirtual.tsx`         | `{ toast }`           |

### 4.3 Remoção da dependência

- **Arquivo**: `package.json`
- **Removed**: `"react-hot-toast": "^2.6.0"`

---

## 5. AUDITORIA LOGGING (2 correções)

### 5.1 FRMS — Audit logging

- **Arquivo**: `worker-airtrust/src/routes/frms.ts`
- **Adicionado**: Helper `auditFrms()` (fire-and-forget, nunca falha operação principal)
- **Operações cobertas**:
  - `POST /jornadas` → INSERT
  - `PUT /jornadas/:id` → UPDATE
  - `DELETE /jornadas/:id` → DELETE
  - `POST /escalas` → INSERT
  - `PUT /escalas/:id` → UPDATE
  - `DELETE /escalas/:id` → DELETE

### 5.2 Pasta Virtual — Audit logging

- **Arquivo**: `worker-airtrust/src/routes/pasta-virtual.ts`
- **Adicionado**: `registrarAuditoria()` calls diretas (try/catch silencioso)
- **Operações cobertas**:
  - `POST /upload` → INSERT (nome_arquivo, tipo, r2_key)
  - `DELETE /delete/:id` → DELETE (cascata)
  - `DELETE /:id` → DELETE (admin, com dados_anteriores)

---

## 6. CORREÇÕES DE ERROR LEAKS (3 correções)

### 6.1 empresas.ts — Erro interno detalhado

- **Problema**: `error: \`Erro interno: \${error.message}\`` expunha detalhes internos
- **Correção**: Substituído por `error: 'Erro interno do servidor'`

### 6.2 empresas.ts — Stack trace em log

- **Problema**: `console.error('[EMPRESAS POST] Stack:', error.stack)` logava stack completo
- **Correção**: Removido `error.stack` do log (mantém `error` que inclui message)

### 6.3 integracoes_edapp.ts — toString() em response

- **Problema**: `details: error.toString()` na resposta do webhook
- **Correção**: Substituído por mensagem genérica

### 6.4 FRMS safe wrapper

- **Problema**: `error.message` original era retornado diretamente ao cliente em 500
- **Correção**: Mensagem genérica: `'Erro interno no módulo FRMS'`

---

## 7. LIMPEZA / OTIMIZAÇÕES (4 correções)

### 7.1 Rota duplicada /api/qualificacoes/

- **Arquivo**: `worker-airtrust/src/index.ts`
- **Problema**: Handler de 15 linhas duplicando lógica já existente no módulo qualificacoes
- **Correção**: Substituído por redirect 301 para `/api/qualificacoes`

### 7.2 process.uptime() no health check

- **Arquivo**: `worker-airtrust/src/index.ts`
- **Problema**: `process.uptime()` não existe em Cloudflare Workers
- **Correção**: Removido campo `uptime` do response stats

### 7.3 Strip console.log em produção

- **Arquivo**: `vite.config.ts`
- **Adicionado**: `esbuild.pure: ['console.log']` para builds de produção
- **Resultado**: 212+ `console.log` do frontend removidos automaticamente no bundle final, sem alterar código fonte

### 7.4 Middleware logger.ts não utilizado

- **Arquivo deletado**: `worker-airtrust/src/middleware/logger.ts`
- **Razão**: Não importado por nenhum arquivo. Middleware logger do Hono usado diretamente.

---

## Arquivos Modificados (22)

| Arquivo                                                             | Tipo                        |
| ------------------------------------------------------------------- | --------------------------- |
| `package.json`                                                      | Removed react-hot-toast dep |
| `vite.config.ts`                                                    | esbuild.pure console.log    |
| `src/react-app/App.tsx`                                             | FRMS ProtectedRoute + lazy  |
| `src/react-app/utils/toast.ts`                                      | Rewrite → sonner            |
| `src/react-app/components/ExportButton.tsx`                         | toast → sonner              |
| `src/react-app/components/UploadDocumentosPastaVirtual.tsx`         | toast → sonner              |
| `src/react-app/components/certificados/UploadCertificado.tsx`       | toast → sonner              |
| `src/react-app/hooks/useQualificacoesExt.ts`                        | toast → sonner              |
| `src/react-app/pages/PastaVirtual.tsx`                              | toast → sonner              |
| `src/react-app/pages/funcionarios/ListaDocumentos.tsx`              | toast → sonner              |
| `src/react-app/pages/funcionarios/UploadDocumentos.tsx`             | toast → sonner              |
| `src/react-app/pages/qualificacoes/FormularioQualificacao.tsx`      | toast → sonner              |
| `src/react-app/pages/simuladores/dashboard/DashboardDesempenho.tsx` | toast → sonner              |
| `worker-airtrust/src/index.ts`                                      | auth + dedup + health       |
| `worker-airtrust/src/middleware/error-handler.ts`                   | X-Debug-Mode                |
| `worker-airtrust/src/middleware/no-cache.ts`                        | CORS wildcard               |
| `worker-airtrust/src/middleware/tenant.ts`                          | SQL injection fixes         |
| `worker-airtrust/src/routes/auth.ts`                                | rate-limit import           |
| `worker-airtrust/src/routes/empresas.ts`                            | error leak fixes            |
| `worker-airtrust/src/routes/frms.ts`                                | rate-limit + audit          |
| `worker-airtrust/src/routes/integracoes_edapp.ts`                   | error leak fix              |
| `worker-airtrust/src/routes/pasta-virtual.ts`                       | audit + CORS fix            |

## Arquivos Deletados (3)

| Arquivo                                         | Razão                          |
| ----------------------------------------------- | ------------------------------ |
| `worker-airtrust/src/middleware/rateLimiter.ts` | BROKEN (fail-open, setTimeout) |
| `worker-airtrust/src/middleware/rateLimit.ts`   | Duplicata de rate-limit.ts     |
| `worker-airtrust/src/middleware/logger.ts`      | Não utilizado                  |

---

## Itens NÃO corrigidos (baixa prioridade ou risco alto)

| Item                                         | Razão                                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| JWT_SECRET migrar para `wrangler secret put` | Feito parcialmente: strings fortes aplicadas; migração para secrets manager é operação separada |
| Múltiplos API clients no frontend (5+)       | Refatoração extensa, risco de regressão alto                                                    |
| window.fetch monkey-patch                    | Complexo, exige refactor do request-control                                                     |
| Tenant middleware global                     | Aplicar a todas as rotas exigiria re-testar todo o sistema                                      |
| N+1 queries em funcionários/qualificações    | Otimização de performance, menor urgência                                                       |
| @types/jest para test files                  | Configuração de testes, não afeta produção                                                      |

---

## 2ª RODADA DE CORREÇÕES (commit `68a9cb5b`)

### R1. JWT Secrets previsíveis no wrangler.toml (CRÍTICO)

- **Arquivo**: `worker-airtrust/wrangler.toml`
- **Problema**: `JWT_SECRET = "staging-secret-jwt-airtrust-2025"` e `JWT_SECRET = "prod-secret-jwt-airtrust-2025"` — strings previsíveis em plaintext no repositório
- **Correção**: Substituídas por strings hexadecimais de 64 chars geradas aleatoriamente. Comentário adicionado orientando migrar para `wrangler secret put JWT_SECRET`

### R2. JWT fallback hardcoded em auth.ts (CRÍTICO)

- **Arquivo**: `worker-airtrust/src/routes/auth.ts`
- **Problema**: 3 ocorrências de `c.env.JWT_SECRET || 'dev-secret-jwt-airtrust-2025'` — qualquer deploy sem `JWT_SECRET` configurado aceitava o segredo hardcoded, inclusive em produção
- **Correção**: Fallback só permitido quando `c.env.ENVIRONMENT === 'development'`. Em staging/production, lança `Error('JWT_SECRET não configurado no ambiente')`
- **Locais**: função `issueAccessTokenForEmpresa`, handler de login, handler de refresh token

### R3. 8 Rotas sem autenticação (CRÍTICO)

Todas as rotas abaixo estavam acessíveis sem token JWT:

| Arquivo                | Proteção aplicada                                         |
| ---------------------- | --------------------------------------------------------- |
| `routes/backup.ts`     | `auth()` + `requireRole('admin')`                         |
| `routes/auditoria.ts`  | `auth()` + `requireRole('admin')`                         |
| `routes/dashboard.ts`  | `auth()` global                                           |
| `routes/licencas.ts`   | `auth()` global                                           |
| `routes/importacao.ts` | `Hono<{Bindings:Env}>` tipado + `auth()`                  |
| `routes/alertas.ts`    | Env local substituída por `../types` + `auth()` por rota¹ |
| `routes/ficha360.ts`   | Env local substituída por `../types` + `auth()` por rota¹ |
| `routes/lookup.ts`     | `auth()` por rota¹                                        |

> ¹ Rotas montadas em `/api` não podem usar `use('*', auth())` pois o deploy guard bloqueia (proteção contra interceptação de `/api/assets/*`). Auth aplicado path a path.

**Bônus**: `alertas.ts` e `ficha360.ts` tinham tipos `Env` locais incompletos (sem `JWT_SECRET`). Substituídos por `import type { Env } from '../types'`.

### R4. auditoria_avancada_v2 — colunas erradas (BUG)

- **Arquivos**: `routes/qualificacoes/atribuicao.ts` e `routes/qualificacoes/tipos.ts`
- **Problema**: Função local `logAuditoria()` fazia INSERT com colunas inexistentes:
  ```sql
  INSERT INTO auditoria_avancada_v2 (entidade, entidade_id, acao, timestamp)
  ```
  A tabela real usa `tabela, registro_id, origem` (sem coluna `timestamp` separada — usa `created_at` default)
- **Correção**: Colunas corrigidas:
  ```sql
  INSERT INTO auditoria_avancada_v2 (tabela, registro_id, acao, origem)
  ```
  Todos os registros de auditoria de atribuição/renovação e tipos de qualificações passam a persistir corretamente

### R5. usuarios.deleted_at DEFAULT 1 (BUG CRÍTICO)

- **Problema**: Coluna `deleted_at INTEGER DEFAULT 1` na tabela `usuarios` — todos os novos usuários cadastrados eram criados com `deleted_at = 1`, aparecendo como soft-deletados imediatamente
- **Verificação**: Confirmado na D1 production via `PRAGMA table_info('usuarios')` → `dflt_value: "1"`
- **Correção**: Duas ações no D1 remoto (produção):
  1. `UPDATE usuarios SET deleted_at = NULL WHERE CAST(deleted_at AS INTEGER) = 1` — patched registros existentes corrompidos (nenhum encontrado, `changes: 0`)
  2. Trigger `fix_usuarios_deleted_at_default` criado: zera automaticamente `deleted_at` quando inserido com valor `1`
- **Nota**: Recriação completa da tabela (conforme migration 0211) não foi possível por FK constraint. Trigger é workaround seguro.

---

## Arquivos Modificados — 2ª Rodada (12)

| Arquivo                                                  | Mudança                                          |
| -------------------------------------------------------- | ------------------------------------------------ |
| `worker-airtrust/wrangler.toml`                          | JWT_SECRET staging + production → strings fortes |
| `worker-airtrust/src/routes/auth.ts`                     | JWT fallback → erro em staging/prod (3 locais)   |
| `worker-airtrust/src/routes/backup.ts`                   | `auth()` + `requireRole('admin')`                |
| `worker-airtrust/src/routes/dashboard.ts`                | `auth()` global                                  |
| `worker-airtrust/src/routes/licencas.ts`                 | `auth()` global                                  |
| `worker-airtrust/src/routes/importacao.ts`               | Tipagem Hono + `auth()`                          |
| `worker-airtrust/src/routes/auditoria.ts`                | `auth()` + `requireRole('admin')`                |
| `worker-airtrust/src/routes/alertas.ts`                  | Env local → `../types` + `auth()` por rota       |
| `worker-airtrust/src/routes/ficha360.ts`                 | Env local → `../types` + `auth()` por rota       |
| `worker-airtrust/src/routes/lookup.ts`                   | `auth()` por rota                                |
| `worker-airtrust/src/routes/qualificacoes/atribuicao.ts` | colunas auditoria_avancada_v2                    |
| `worker-airtrust/src/routes/qualificacoes/tipos.ts`      | colunas auditoria_avancada_v2                    |

## D1 Production — 2ª Rodada

| Operação                                       | Resultado                                   |
| ---------------------------------------------- | ------------------------------------------- |
| UPDATE usuarios deleted_at = 1 → NULL          | 0 linhas afetadas (sem corrupção existente) |
| CREATE TRIGGER fix_usuarios_deleted_at_default | ✅ Criado (rows_written: 1)                 |

---

## Verificação Pós-Deploy

### 1ª Rodada (cd30647a)

```
✅ Worker Health: healthy (version cd30647a, region BR)
✅ Pages: deployed (build cd30647a)
✅ Smoke test: assets=404 protected=401 (auth boundaries OK)
✅ Frontend build: 0 errors
✅ Worker bundle: 8050 KiB (compila sem erros)
```

### 2ª Rodada (68a9cb5b)

```
✅ Worker Version ID: 50d648fb-9188-4e68-a764-585dfe7ea015
✅ Pages: deployed (build 68a9cb5b)
✅ Smoke test: assets=404 protected=401 (auth boundaries OK)
✅ Frontend build: 0 errors (✓ built in 8.33s)
✅ Auth boundary guard: OK
✅ D1 trigger criado: fix_usuarios_deleted_at_default
```

---

## 3ª RODADA DE CORREÇÕES — SIMULADORES (4 Mar 2026)

### Escopo

- Auditoria completa no módulo de simuladores em produção (`D1 remote`) para sessões, fichas, modelos, manobras e vínculos.
- Restauração dos dados que estavam ocultos por soft delete.
- Correção de segurança para evitar recorrência (DELETE somente para ADMIN).

### Causa Raiz Encontrada

- Os dados não estavam perdidos fisicamente: estavam majoritariamente em `deleted_at` nas tabelas do módulo.
- Endpoints destrutivos (`DELETE`) em `simuladores.ts` aceitavam qualquer usuário autenticado (sem validação de role ADMIN).

### Evidências (antes da restauração)

- `simulador_agendamentos`: 33 total, **4 ativos**, 29 deletados
- `fichas_sessao`: 67 total, **6 ativos**, 61 deletados
- `sessoes_participantes`: 104 total, **8 ativos**, 96 deletados
- `modelos_sessao`: 29 total, **22 ativos**, 7 deletados
- `modelos_sessao_manobras`: 478 total, **412 ativos**, 66 deletados
- `tipos_sessao`: 14 total, **2 ativos**, 12 deletados
- `simuladores`: 16 total, **2 ativos**, 14 deletados

### Correções Aplicadas

1. **Restauração de dados em produção**

- Script criado: `scripts/restore-simuladores-2026-03-04.sql`
- Executado no D1 remoto (`wrangler d1 execute --remote --file ...`)
- Resultado: **1228 linhas reativadas**

2. **Bloqueio de DELETE para ADMIN**

- Arquivo: `worker-airtrust/src/routes/simuladores.ts`
- Adicionado helper `requireAdminForDelete()`
- Aplicado em todas as rotas DELETE do módulo:
  - `/tipos-sessao/:id`
  - `/modelos-sessao/:id`
  - `/categorias/:id`
  - `/manobras/:id`
  - `/sessoes/:id`
  - `/participantes/:id`
  - `/fichas/:id`
  - `/:id` (simuladores)

### Evidências (depois da restauração)

- `simulador_agendamentos`: 33 total, **33 ativos**, 0 deletados
- `fichas_sessao`: 67 total, **67 ativos**, 0 deletados
- `sessoes_participantes`: 104 total, **104 ativos**, 0 deletados
- `modelos_sessao`: 29 total, **29 ativos**, 0 deletados
- `modelos_sessao_manobras`: 478 total, **478 ativos**, 0 deletados
- `tipos_sessao`: 14 total, **14 ativos**, 0 deletados
- `simuladores`: 16 total, **16 ativos**, 0 deletados

### Deploy e Produção

- Pipeline executado: `./deploy-full-automated.sh`
- **Worker Version ID**: `30e9f360-7371-42de-92bb-9aa33ba9deab`
- **Build/version (Pages + API health)**: `2524f849`
- Health check pós-deploy: `healthy`
