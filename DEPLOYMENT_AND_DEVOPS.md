# AirTrust — Deployment & DevOps

> **Versão do documento:** 1.2 | **Atualizado:** 2026-10-01 | **Autoridade:** GitHub `Airtrust-Org/airtrust` / `main`
>
> ⚠️ **[DOCUMENTO INTERNO]** Este documento descreve a arquitetura de deploy.
> Não é um manual operacional executável. Nenhum comando aqui autoriza deploy,
> migration ou acesso remoto a D1/R2/produção. Toda ação em produção requer
> autorização explícita do responsável técnico.

---

## Sumário

1. [Visão Geral do Pipeline](#1-visão-geral-do-pipeline)
2. [Scripts de Deploy](#2-scripts-de-deploy)
3. [Ambientes Cloudflare](#3-ambientes-cloudflare)
4. [CI/CD — GitHub Actions](#4-cicd--github-actions)
5. [Segurança do Deploy](#5-segurança-do-deploy)
6. [Migrações D1 em Produção](#6-migrações-d1-em-produção)
7. [Scripts de Guarda](#7-scripts-de-guarda)
8. [Monitoramento e Logs](#8-monitoramento-e-logs)
9. [Build e Bundle](#9-build-e-bundle)

---

## 1. Visão Geral do Pipeline

O caminho rotineiro de release é governado por GitHub Actions. A CI oficial exige os oito gates
`lint`, `build-content-gates`, `worker-typecheck`, `frontend-coverage`, `worker-tests-1`,
`worker-tests-2`, `lms-smoke` e `public-e2e`. Merge e CI verde não equivalem a deploy.

```text
PR -> 8 gates -> merge em main -> staging autorizado -> validação real -> produção autorizada
```

- Staging: `.github/workflows/deploy-staging.yml`.
- Produção: `.github/workflows/deploy-airtrust.yml`.
- Schema de produção: `.github/workflows/apply-schema-change-v2.yml`.
- Google Cloud Build é contingência quando GitHub Actions estiver indisponível ou defeituoso; não é bypass.

---

## 2. Entry points locais de deploy

Os aliases locais de produção são mantidos somente como stubs fail-closed para compatibilidade:
`npm run deploy`, `deploy:pages`, `deploy:worker`, `deploy:worker:only` e `deploy:all` não são
rotas rotineiras de release. `deploy:worker:safe` também é bloqueado por padrão e só pode ser
acionado pelo wrapper de emergência revisado, dentro de uma janela explicitamente autorizada.

Para staging, o fluxo oficial continua sendo `deploy-staging.yml`. O script
`scripts/deploy-staging-worker-safe.sh` é staging-only, exige confirmação explícita e não aplica
migrations nem publica Pages.

---

## 3. Ambientes Cloudflare

### 3.1 Workers (Backend)

| Ambiente | Worker Name | Domínio | D1 DB | R2 Bucket |
|---|---|---|---|---|
| **Produção** | `airtrust-api-production` | `api.airtrust.online` | `airtrust-db` | `airtrust-storage` |
| **Staging** | `airtrust-api-staging` | `*.workers.dev` | `airtrust-db-staging-baseline-20260701` | `airtrust-storage-staging` |
| **Development** | `airtrust-api-development` | `*.workers.dev` | `airtrust-db-dev` | `airtrust-storage-dev` |
| **Local** | `airtrust-api` | `localhost:8787` | Local SQLite (Miniflare) | Local R2 (Miniflare) |

### 3.2 Pages (Frontend)

| Ambiente | Projeto | Branch | Domínio |
|---|---|---|---|
| **Produção** | `airtrust` | `production` | `airtrust.pages.dev` + domínio customizado |
| **Staging** | `airtrust` | `staging` (preview) | `*.airtrust.pages.dev` |

### 3.3 Configuração Wrangler

| Arquivo | Uso |
|---|---|
| `worker-airtrust/wrangler.toml` | Config base com 3 ambientes (dev/staging/prod) |
| `worker-airtrust/wrangler.dev.toml` | Config local (wrangler dev --local) |
| `worker-airtrust/wrangler.deploy.toml` | Template para deploy (versionado, com placeholders) |
| `worker-airtrust/wrangler.deploy.*.tmp.toml` | Gerado no deploy (NÃO versionado, limpo após deploy) |

### 3.4 Bindings por ambiente

| Binding | Dev | Staging | Prod |
|---|---|---|---|
| `DB` (D1) | `airtrust-db-dev` | `airtrust-db-staging-baseline-20260701` | `airtrust-db` |
| `BUCKET` (R2) | `airtrust-storage-dev` | `airtrust-storage-staging` | `airtrust-storage` |
| `AI` (Workers AI) | ✅ | ✅ | ✅ |

---

## 4. CI/CD — GitHub Actions

### 4.1 Workflows operacionais principais

O diretório `.github/workflows/` contém fluxos operacionais e de validação. O número
exato de arquivos pode variar; a proteção da `main` depende dos **oito gates diretos**
abaixo, e não de um agregador legado:

`lint`, `build-content-gates`, `worker-typecheck`, `frontend-coverage`,
`worker-tests-1`, `worker-tests-2`, `lms-smoke` e `public-e2e`.

| Workflow | Uso atual |
|---|---|
| **ci.yml** | Gates rápidos: `lint`, `build-content-gates`, `worker-typecheck` |
| **heavy-ci.yml** | Gates pesados: cobertura frontend, testes Worker, LMS smoke e public E2E |
| **pr-check.yml** | Validação complementar de PR |
| **deploy-staging.yml** | Deploy governado de staging e smoke autorizado |
| **deploy-airtrust.yml** | Deploy governado de produção; não executa migrations legadas |
| **apply-schema-change-v2.yml** | Única rota governada para mudança de schema de produção via Schema V2 |

O antigo `deploy-pages.yml` foi aposentado. Pages é publicado somente pelos workflows
governados de staging/produção aplicáveis ao release.

### 4.2 Pipeline oficial

1. PR contra `main` executa os oito gates obrigatórios.
2. O merge só ocorre com a proteção da branch satisfeita, sem bypass.
3. Staging é publicado pelo `deploy-staging.yml` para o SHA autorizado e validado no ambiente real.
4. Produção exige autorização explícita para o SHA/artefato/escopo e usa `deploy-airtrust.yml`.
5. Mudanças de schema usam separadamente `apply-schema-change-v2.yml`, com contrato, hashes,
   recovery point/backup quando aplicável, ledger e pós-validação.

Merge e CI verde, isoladamente, **não** significam deploy.

---

## 5. Segurança do Deploy

### 5.1 Gates de segurança

| Gate | Descrição |
|---|---|
| **Pre-flight** | Branch=main, clean state, HEAD=origin/main |
| **Legacy migrations block** | `deploy-airtrust.yml` encerra com `LEGACY_MIGRATION_RUNNER_DISABLED_USE_SCHEMA_V2` |
| **APP_VERSION gate** | APP_VERSION só pode ser definido externamente com `AIRTRUST_ALLOW_APP_VERSION_OVERRIDE=1` |
| **Secrets guard** | `check-tracked-secrets.sh` antes de cada deploy |
| **Demo data guard** | `ci-demo-data-check.sh` no CI |
| **Auth boundary guard** | `guard-auth-boundaries.sh` verifica ordem de rotas |

### 5.2 Governança de schema V2

> **[INTERNO — não executável deste documento]**
>
> Produção não usa mais `wrangler d1 migrations apply --remote`.
> O fluxo vigente é:
> 1. validar o contrato em modo read-only;
> 2. aplicar somente o bootstrap V2 ou um arquivo único em `worker-airtrust/schema-v2/`;
> 3. registrar a aplicação em `airtrust_schema_baselines_v2` ou `airtrust_schema_changes_v2`;
> 4. revalidar o contrato.

### 5.3 Entry points locais

`scripts/deploy-worker-only.sh` é um stub **fail-closed**: o deploy local de produção
está desabilitado e o script encerra orientando para `.github/workflows/deploy-airtrust.yml`.
Ele não aplica migrations D1. Entry points locais históricos não devem ser reativados para
contornar os workflows oficiais.

---

## 6. Migrações D1 em Produção

> **[INTERNO — não executável deste documento]**
>
> Migrações em produção requerem autorização explícita do responsável técnico.
> Nunca executar comandos D1 `--remote --env production` fora do fluxo de deploy
> autorizado. Consultar o runbook operacional interno (`docs/LOCAL_PROD_CLONE.md`
> e os scripts de gate) antes de qualquer ação.

### 6.1 Fluxo seguro atual

- baseline real auditado e congelado em `docs/database/schema-contracts/production-d1-baseline-v2.json`;
- bootstrap inicial só cria `airtrust_schema_baselines_v2` e `airtrust_schema_changes_v2`;
- mudanças futuras entram como arquivo único em `worker-airtrust/schema-v2/changes/`;
- aplicação manual somente por `apply-schema-change-v2.yml`, com `expected_sha`, `file_hash`, `plan_hash`, `confirm_production=AIRTRUST_PRODUCTION` e validação pré/pós do contrato read-only.

### 6.2 Proibições

- proibido rodar `wrangler d1 migrations apply --remote` em produção;
- proibido alterar `d1_migrations` para reconciliar drift histórico;
- proibido aplicar múltiplos arquivos SQL numa única execução de change V2;
- proibido deployar Worker ou Pages como parte da governança de schema V2.
Migrations só são aplicadas se as variáveis de gate corretas estiverem presentes.
Não executar `wrangler d1 migrations apply` diretamente sem passar pelo gate.

### 6.2 Aplicação de migration específica

Para aplicar uma migration específica fora do deploy completo, usar o fluxo
documentado no runbook operacional. Não execute comandos `--remote` sem
revisão e autorização explícita do responsável técnico.

### 6.3 Reset local

```bash
npm run setup:local:reset
# → bash scripts/setup-local-db.sh --reset
# → Recria o banco local e aplica TODAS as migrations
```

---

## 7. Scripts de Guarda

### 7.1 guard:auth-boundaries (`scripts/guard-auth-boundaries.sh`)

Verifica que:
- `/api/assets` é registrado ANTES do `app.route('/api', lookup)` genérico
- Rotas públicas não são acidentalmente protegidas por middleware global de auth

### 7.2 guard:tracked-secrets (`scripts/check-tracked-secrets.sh`)

Verifica com `git grep`:
- Senhas padrão hardcoded
- `ENABLE_DEV_AUTH_BYPASS=true` em arquivos trackeados
- `JWT_SECRET` hardcoded
- `CLOUDFLARE_API_TOKEN` exposto
- Segredos EdApp

### 7.3 guard:empresa-default1 (`scripts/guard-no-new-empresa-default1.sh`)

Scaneia migrations acima de `0394` por `empresa_id INTEGER DEFAULT 1`:
- Previne novas violações de multi-tenant no schema
- Bloqueia PRs que adicionam `DEFAULT 1` em coluna `empresa_id`

### 7.4 ops:guard (`scripts/audit-dangerous-ops.sh`)

**274 linhas** — 5 guards:
1. Detecta `--commit-dirty=true` em scripts
2. Detecta `git add .` / `git add -A` em scripts
3. Detecta execução remota D1 fora de allowlist (~30 scripts read-only + 4 self-protected)
4. Detecta DDL/DML colocalizado com `--remote`
5. Audita scripts legados para acesso D1 remoto desprotegido

### 7.5 check:demo-data (`scripts/ci-demo-data-check.sh`)

Verifica:
- Arquivos CSV de seed em `src/`
- Emails demo hardcoded
- `ENABLE_DEV_AUTH_BYPASS` em arquivos trackeados
- Chamadas de seed/fixture em código de produção

### 7.6 lint:api-base (`scripts/lint-api-base.sh`)

Verifica padrões de API base URL no frontend.

---

## 8. Monitoramento e Logs

### 8.1 Tail de logs (produção)

```bash
npm run logs:tail
# → wrangler tail --env production
# → Stream ao vivo de console.log/error do Worker em produção
```

### 8.2 Análise de erros

```bash
npm run logs:errors
# → scripts/analyze-logs.sh ERROR 60
# → Análise dos últimos 60 minutos de logs filtrando ERROR
```

### 8.3 Health check

```bash
npm run health
# → curl http://localhost:8787/health | python3 -m json.tool
```

### 8.4 Smoke tests

| Script | Descrição |
|---|---|
| `smoke:core:prod` | Smoke test core na produção |
| `smoke:core:local` | Smoke test core no worker local |
| `smoke:auth:login` | Teste de login |
| `smoke:assets-public` | Verifica assets públicos |
| `smoke:lms:local` | Smoke test LMS completo |

### 8.5 Telemetria de erros do frontend

**Endpoint**: `POST /api/telemetry/client-error`

Recebe erros do frontend (chunk-load failures, dynamic import errors, etc.) e loga
no console do Worker:

```json
{
  "type": "frontend_error",
  "scope": "chunk-load",
  "moduleKey": "FrmsDashboard",
  "message": "Failed to fetch dynamically imported module",
  "path": "/frms",
  "href": "https://airtrust.pages.dev/frms",
  "userAgent": "Mozilla/5.0 ..."
}
```

---

## 9. Build e Bundle

### 9.1 Comando de build

```bash
npm run build
# → PATH=/opt/homebrew/opt/node@22/bin:$PATH vite build
# → bash scripts/remove-duplicate-build-assets.sh
# → tsc --noEmit false (type check, ignora erros)
```

### 9.2 Métricas do bundle

| Métrica | Valor |
|---|---|
| Chunks JS | 287 |
| Chunks CSS | 2 |
| Tamanho total | ~12 MB |
| Maior chunk | `charts-<hash>.js` (432 KB — recharts) |
| Build time | ~5.73s |
| Target | ES2020 |
| Source maps | Apenas em dev |
| Minify | Apenas em produção |

### 9.3 Manual chunks (code splitting)

| Chunk | Dependências | Tamanho estimado |
|---|---|---|
| `vendor` | `react` + `react-dom` | ~130 KB |
| `router` | `react-router-dom` | ~60 KB |
| `query` | `@tanstack/react-query` | ~80 KB |
| `charts` | `recharts` | ~432 KB |
| `pdf` | `jspdf` | ~180 KB |
| `capture` | `html2canvas` | ~80 KB |
| `excel` | `xlsx` | ~500 KB |
| `forms` | `react-hook-form` + `zod` | ~40 KB |
| `dnd` | `@dnd-kit/*` | ~60 KB |

### 9.4 Remove duplicate build assets

O script `remove-duplicate-build-assets.sh` remove duplicatas no `dist/`:
- `forms*.js` (2 cópias)
- `capture*.js` (2 cópias)
- Outros chunks duplicados (artefato do Vite em algumas configurações)

### 9.5 Compatibility flags

```toml
compatibility_date = "2025-11-22"
compatibility_flags = ["nodejs_compat"]
```

### 9.6 Wrangler Pages config

```json
// wrangler-pages.json
{
  "build": { "command": "npm run build", "destination": "/dist/client" },
  "vars": { "API_BASE_URL": "https://api.airtrust.online" },
  "compatibility_date": "2025-06-17"
}
```

---

## Apêndice: Scripts NPM completos

| Categoria | Scripts |
|---|---|
| **Dev** | `dev`, `dev:safe`, `dev:worker`, `dev:worker:local`, `start` |
| **Build** | `prebuild`, `build`, `build:clean`, `preview` |
| **Deploy** | aliases locais de produção são fail-closed; releases usam `deploy-staging.yml` / `deploy-airtrust.yml`; `release:worker:local-emergency` é exceção governada |
| **Test** | `test`, `test:run`, `test:worker`, `test:all`, `test:coverage`, `test:e2e`, `test:e2e:ui`, `test:e2e:headed`, `test:guard:sw-cache` |
| **Guard** | `ops:guard`, `guard:auth-boundaries`, `guard:tracked-secrets`, `guard:empresa-default1`, `check:demo-data`, `lint:api-base`, `lint`, `validate:data-quality-sql` |
| **DB** | `db:init`, `db:status`, `setup:dev`, `setup:local`, `setup:local:reset`, `sync:prod:local:safe`, `sync:prod:dev:safe` |
| **Seed** | `seed:lms:pdf:local`, `seed:lms:pptx:local` |
| **Smoke** | `smoke:lms:local`, `smoke:assets-public`, `smoke:auth:login`, `smoke:core:prod`, `smoke:core:local` |
| **Ops** | `health`, `logs:tail`, `logs:errors`, `storage:r2:bootstrap`, `data-quality:local` |
