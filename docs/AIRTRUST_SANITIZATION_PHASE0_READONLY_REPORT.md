# AirTrust Sanitization Phase 0 Read-only Report

Data local: 2026-06-14 22:35:16 -03

Modo: read-only, sem deploy, sem push, sem migration, sem staging/producao remoto, sem secrets exibidos.

## Veredito

**BLOQUEADO POR RISCO**

Nao ha secret staged e o guard de secrets rastreados passou. Porem o repositorio nao esta seguro para qualquer deploy, staging ou producao: a branch `main` local esta 28 commits a frente de `origin/main`, a working tree esta suja, ha scripts perigosos novos/ativos, o guard operacional falha, ha cadeia de migrations com duplicatas historicas e existe arquivo `.env.local.production` ignorado com chaves sensiveis preenchidas.

## Estado Git

- Branch atual: `main`
- HEAD local: `22c7015597b1090bce9cd7c6400bfd65bf91b0d3`
- `origin/main`: `971f95fe8082d32d4621272c95d4468a28fcdd7f`
- Divergencia `origin/main...HEAD`: `0 28` ou seja, local 28 commits a frente e 0 atras
- Staged: nenhum arquivo
- Modified rastreados:
  - `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`
  - `docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md`
  - `index.html`
  - `public/app.webmanifest`
  - `public/favicon.ico`
  - `src/react-app/components/AppLayout.tsx`
  - `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
  - `worker-airtrust/src/__tests__/migrations/regulated-records-core-experimental.test.ts`
- Untracked relevantes:
  - docs raiz: `API_REFERENCE.md`, `ARCHITECTURE_OVERVIEW.md`, `AUTH_RBAC_MULTITENANCY.md`, `DATABASE_SCHEMA.md`, `DEPLOYMENT_AND_DEVOPS.md`, `FRMS_ARCHITECTURE.md`, `FRONTEND_ARCHITECTURE.md`, `INTEGRATIONS.md`, `LMS_ARCHITECTURE.md`, `MODULES_AND_FEATURES.md`, `SECURITY.md`
  - docs de fase: `docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md`, `docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`, `docs/GOVERNANCE_EVIDENCE_RECORD_VERTICAL_SLICE.md`, `docs/LOCAL_PROD_CLONE.md`, `docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md`
  - LMS: `lms/`, `src/__tests__/lms-content-preview-readiness.test.ts`
  - assets publicos: novos favicons/icons em `public/`
  - scripts/export: `scripts/clone-production-d1-to-local.sh`, `scripts/export-funcionarios.sh`, `scripts/export_funcionarios.py`, `scripts/export_producao.py`
  - artefatos exportados: `scripts/export_funcionarios_airtrust*.csv`, `scripts/export_funcionarios_airtrust*.json`, relatorios derivados
  - regulated records: `worker-airtrust/src/lib/regulated-records/governance-evidence-service.ts`, `worker-airtrust/src/__tests__/lib/`
- Ignored relevantes:
  - `.env.local`, `.env.local.production`, `.env.production`, `.env.test`
  - `.playwright-cli/*.log`
  - `dist/`, `node_modules/`, `tmp/`, `worker-airtrust/.wrangler/`

## Separacao Por Frente

- Controle de Voos N1: docs SIGVOOS/Controle de Voos untracked; migration canonica `0410_controle_voos_n1_schema.sql` existe; nao ha `0411` como arquivo de migration.
- Setor/RBAC/multi-tenant: `AUTH_RBAC_MULTITENANCY.md` untracked; `AppLayout.tsx` modificado; sem alteracao aplicada em RBAC/multi-tenant nesta fase.
- LMS: docs de arquitetura LMS, SCORM em `lms/scorm/6/26` e `lms/scorm/6/27`, teste `lms-content-preview-readiness`; migrations LMS existentes `0408/0409` sem modificacao.
- Manutencao/APUS: sem alteracao clara detectada nos arquivos sujos desta fase.
- Docs: muitos documentos novos de arquitetura, governanca, migracao e clones locais.
- Scripts: novo script de clone de D1 producao para local e scripts/export de funcionarios; varios scripts historicos de deploy/sync/migration continuam presentes.
- Migrations: apenas a migration experimental `0410_experimental_regulated_records_core.sql` esta modificada; cadeia canonica tem duplicatas historicas.
- Sujeira temporaria/local: `.env*` ignorados, `tmp/`, `dist/`, `.wrangler`, `node_modules`, logs Playwright. Nenhum arquivo foi movido de `/tmp` para o repo nesta fase.

## Migrations

- Total canonico em `worker-airtrust/migrations/*.sql`: 381
- Total experimental em `worker-airtrust/migrations_experimental/*.sql`: 1
- Total combinado auditado: 382
- `0410`: presente em dois lugares:
  - `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql`
  - `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
- `0411`: ausente como arquivo de migration; aparece somente em documentacao de design.
- Arquivos fora do padrao ou sensiveis:
  - `worker-airtrust/migrations/9999_add_modelo_sessao_id_to_agendamentos.sql`
  - `worker-airtrust/migrations/purge-soft-deleted-qualificacoes.sql`
  - `worker-airtrust/migrations/0020_simuladores_final.sql.bkp`
  - `worker-airtrust/migrations/132_add_funcionario_ativo.sql`
  - `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
- Prefixos duplicados detectados:
  - `0049`, `0062`, `0063`, `0068`, `0069`, `0093`, `0107`, `0112`, `0117`, `0137`, `0140`, `0144`, `0145`, `0151`, `0159`, `0172`, `0200`, `0215`, `0246`, `0263`, `0284`, `0320`, `0332`, `0340`, `0347`, `0362`, `0367`, `0410`: 2 cada
  - `0098`, `0150`: 3 cada
  - `0092`: 9

## Scripts E Configs Perigosos

- `.github/workflows/deploy.yml` roda `npx wrangler d1 migrations apply airtrust-db --env production --remote` e depois deploy de Worker em `main`.
- `package.json` tem comandos de deploy, logs de producao, sync prod->local e wrappers que podem tocar Cloudflare/D1 se executados.
- `worker-airtrust/package.json` tem `deploy`, `tail`, `d1:migrate:prod`, `d1:seed:prod`, `secret:put`, `secret:list`.
- `scripts/deploy-worker-only.sh` contem `wrangler d1 migrations apply airtrust-db --env production --remote`, com gate por env vars, mas ainda e caminho de risco alto.
- `scripts/clone-production-d1-to-local.sh` e untracked e fez o guard `audit-dangerous-ops.sh` falhar por D1 remoto fora de allowlist.
- Scripts com `git add -A` fora de legacy detectados pelo guard:
  - `scripts/00-checkpoint-inicial.sh`
  - `scripts/fix-urls.sh`
  - `scripts/remove-confirm-dialogs.sh`
  - `scripts/fix-all-select-star.sh`
  - `scripts/fix-auditoria-columns.sh`
- Busca por tokens sensiveis em tracked:
  - `bash scripts/check-tracked-secrets.sh`: OK
  - Nao houve secret staged.

## Configs

- `worker-airtrust/wrangler.toml`
  - `env.development`: `airtrust-db-dev`
  - `env.staging`: `airtrust-db-staging`
  - `env.production`: `airtrust-db`
  - contem R2 bindings para dev/staging/producao.
- `worker-airtrust/wrangler.dev.toml`
  - D1 local `airtrust-db-local`, id dummy `00000000-0000-0000-0000-000000000001`.
- `worker-airtrust/wrangler.pilot-cv-n1.toml`
  - D1 dedicado `airtrust-db-pilot-cv-n1`.
- `worker-frontend/wrangler.toml`
  - `env.staging`: `airtrust-frontend-staging`
  - `env.production`: `airtrust-frontend`
- `.env*`
  - Rastreados: `.env.example`, `worker-airtrust/.env.example`
  - Ignorados com valores definidos: `.env.local`, `.env.local.production`, `.env.production`, `src/.env.production`
  - `.env.local.production` possui nomes de chaves sensiveis definidos (`R2_SECRET_ACCESS_KEY`, `D1_AUTH_TOKEN`, `JWT_SECRET`), sem valores exibidos.
- Vite proxy:
  - `vite.config.ts` defaulta `VITE_DEV_PROXY_TARGET` para `http://localhost:8787`.
  - `vite.config.ts.disabled` ainda aponta defaults para worker de producao.
  - `src/react-app/config/api.ts` tem comentario desatualizado dizendo que o default local e producao, apesar do config atual usar localhost.

## Validacoes Read-only

- `git diff --check`: PASS
- `npx tsc --noEmit --pretty false`: PASS
- `bash scripts/check-tracked-secrets.sh`: PASS
- `bash scripts/validation/audit-deploy-scripts.sh`: PASS, mas inventaria `migrations apply` em scripts/docs/workflow
- `bash scripts/audit-dangerous-ops.sh`: FAIL
  - warning de `git add -A`
  - erro por `scripts/clone-production-d1-to-local.sh`
  - warnings por scripts com `--remote` e DDL/DML em contexto de sync

## Matriz De Risco

| Risco | Severidade | Evidencia | Bloqueia deploy/staging/producao | Acao segura |
|---|---:|---|---|---|
| Workflow em `main` aplica migrations em producao automaticamente | Critica | `.github/workflows/deploy.yml` | Sim | Desabilitar/gatear em Fase 1, sem executar |
| Guard operacional falhando | Alta | `audit-dangerous-ops.sh` FAIL | Sim | Corrigir scripts perigosos antes de qualquer publicacao |
| `main` local 28 commits a frente do remoto | Alta | `rev-list 0 28` | Sim | Reconciliar branch/PR antes de deploy |
| Working tree suja com varias frentes misturadas | Alta | modified + untracked | Sim | Separar commits/descartes por frente |
| Migrations com prefixos duplicados e `9999/purge/bkp/132` | Alta | inventario de migrations | Sim para qualquer `migrations apply` | Governanca de cadeia antes de staging/producao |
| `.env.local.production` ignorado com secrets definidos | Alta | inventario sem valores | Sim ate confirmar armazenamento seguro | Manter fora do Git; rotacionar se houver duvida |
| Artefatos CSV/JSON de funcionarios untracked | Alta | `scripts/export_funcionarios_airtrust*.csv/json` | Sim | Remover do repo ou mover para storage seguro fora do Git |
| Config piloto D1 dedicado existente | Media | `wrangler.pilot-cv-n1.toml` | Nao por si so | Preservar isolado; nao misturar com staging/producao |
| Docs mencionando 0411 sem arquivo real | Media | docs de design | Sim para implementacao 0411 | Planejar 0411 separadamente, nao criar nesta fase |

## Arquivos Que Podem Ser Commitados Seletivamente

Somente apos revisao de diff e em commits separados:

- Branding/assets:
  - `index.html`
  - `public/app.webmanifest`
  - `public/favicon.ico`
  - novos icons em `public/`
- Layout:
  - `src/react-app/components/AppLayout.tsx`
- Regulated Records experimental/local:
  - `docs/REGULATED_RECORDS_CORE_DEVELOPMENT_LOCAL_CANDIDATE.md`
  - `docs/REGULATED_RECORDS_CORE_EXPERIMENTAL_MIGRATION.md`
  - `worker-airtrust/migrations_experimental/0410_experimental_regulated_records_core.sql`
  - `worker-airtrust/src/__tests__/migrations/regulated-records-core-experimental.test.ts`
  - `worker-airtrust/src/lib/regulated-records/governance-evidence-service.ts`
  - `worker-airtrust/src/__tests__/lib/regulated-records/governance-evidence-service.test.ts`
- Docs arquiteturais, se sanitizados e sem dados reais:
  - `API_REFERENCE.md`, `ARCHITECTURE_OVERVIEW.md`, `AUTH_RBAC_MULTITENANCY.md`, `DATABASE_SCHEMA.md`, `DEPLOYMENT_AND_DEVOPS.md`, `FRMS_ARCHITECTURE.md`, `FRONTEND_ARCHITECTURE.md`, `INTEGRATIONS.md`, `LMS_ARCHITECTURE.md`, `MODULES_AND_FEATURES.md`, `SECURITY.md`
- Controle de Voos/SIGVOOS docs, se escopo aprovado:
  - `docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md`
  - `docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`
  - `docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md`
- LMS:
  - `src/__tests__/lms-content-preview-readiness.test.ts`
  - `lms/scorm/...` apenas se o repo deve versionar pacotes SCORM e apos revisar tamanho/licencas/dados.

## Arquivos Que Devem Ser Descartados, Ignorados Ou Manter Fora Do Repo

- Nunca commitar como estao:
  - `.env.local`
  - `.env.local.production`
  - `.env.production`
  - `.env.test`
  - `src/.env.production`
- Manter fora do Git ou remover com seguranca:
  - `scripts/export_funcionarios_airtrust.csv`
  - `scripts/export_funcionarios_airtrust.json`
  - `scripts/export_funcionarios_airtrust_producao.csv`
  - `scripts/export_funcionarios_airtrust_producao.json`
  - relatorios de export que possam conter dados pessoais.
- Nao commitar sem hardening:
  - `scripts/clone-production-d1-to-local.sh`
  - `scripts/export_producao.py`
  - `scripts/export_funcionarios.py`
  - `scripts/export-funcionarios.sh`
  - `docs/LOCAL_PROD_CLONE.md`, salvo se for runbook sanitizado sem comandos perigosos.
- Ignorados locais a manter fora:
  - `dist/`, `node_modules/`, `tmp/`, `worker-airtrust/.wrangler/`, logs Playwright.

## Bloqueantes Antes De Qualquer Deploy/Staging/Producao

1. Resolver `audit-dangerous-ops.sh` FAIL.
2. Desabilitar ou gatear fortemente `.github/workflows/deploy.yml` para nao aplicar migrations em producao automaticamente.
3. Nao usar `wrangler d1 migrations apply` em staging atual enquanto a governanca de migrations e o ledger nao estiverem reconciliados.
4. Separar a working tree em frentes pequenas e revisaveis; nao misturar docs, assets, LMS, scripts, regulated records e Controle de Voos no mesmo commit.
5. Remover/manter fora do Git exports CSV/JSON de funcionarios e qualquer artefato derivado de producao.
6. Confirmar que `.env.local.production` nao foi rastreado novamente e avaliar rotacao se algum valor tiver sido exposto historicamente.
7. Confirmar politica para SCORM em `lms/` antes de versionar pacotes.
8. Confirmar que `0411` continuara inexistente ate fase propria; nao criar nesta sanitizacao.

## Plano Seguro De Fase 1

1. Higiene operacional read-only-to-edit:
   - Corrigir scripts/workflows perigosos sem executar Cloudflare.
   - Meta: `audit-dangerous-ops.sh` PASS.
   - Modelo recomendado: Codex 5.5.
   - Esforco: alto.
2. Higiene de artefatos sensiveis:
   - Remover do working tree untracked CSV/JSON de funcionarios ou mover para storage seguro fora do repo.
   - Atualizar `.gitignore` se necessario.
   - Modelo recomendado: Codex 5.5.
   - Esforco: alto.
3. Separacao de commits por frente:
   - Branding/layout, docs arquiteturais, LMS, regulated records, Controle de Voos docs, scripts.
   - Modelo recomendado: Codex 5.5 para scripts/migrations; Codex 5 para docs/branding simples.
   - Esforco: medio a alto.
4. Governanca de migrations:
   - Gerar inventario versionado dos prefixos duplicados, arquivos fora do padrao e regra para experimental.
   - Nao aplicar migrations.
   - Modelo recomendado: Codex 5.5.
   - Esforco: alto.
5. Preflight local final:
   - Repetir `git diff --check`, `npx tsc --noEmit --pretty false`, `check-tracked-secrets`, `audit-dangerous-ops`, `audit-deploy-scripts`.
   - Modelo recomendado: Codex 5.
   - Esforco: medio.
6. So depois planejar staging:
   - Criar runbook especifico, sem tocar `airtrust-db-staging` ate resolver ledger e autorizacao explicita.
   - Modelo recomendado: Codex 5.5.
   - Esforco: alto.

## Confirmacoes Da Fase 0

- Nenhum deploy executado.
- Nenhum push executado.
- Nenhuma migration aplicada.
- Producao nao foi tocada.
- `airtrust-db-staging` nao foi tocado.
- Nenhum comando com `--env production` foi executado.
- Nenhum script de D1 remoto/R2/secrets/Cloudflare foi executado.
- `git add .` nao foi usado.
- Nenhum commit criado.
- `0411` nao foi criado.
- FRMS, SIGVOOS, RBAC e multi-tenant nao foram alterados.
- Nenhum arquivo de `/tmp` foi movido para o repo.
