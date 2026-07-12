# Provenance de staging — recursos, IDs e injeção de versão

Escopo: documentação, sem ação remota. Ambiente sintético — nenhuma
homologação/aceitação ANAC, nenhum dado real, nenhuma equivalência automática
com produção.

## Matriz de recursos (confirmada por ID/binding, não por nome)

| Recurso | Staging | Produção | Evidência |
|---|---|---|---|
| Worker (nome) | `airtrust-api-staging` | `airtrust-api-production` | `worker-airtrust/wrangler.toml` `[env.staging]`/`[env.production]` |
| D1 (nome) | `airtrust-db-staging-baseline-20260701` | `airtrust-db` | idem |
| D1 (database_id) | `bf9963f4-eb12-439b-a830-20bbf577ac22` | `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae` | idem |
| R2 bucket | `airtrust-storage-staging` | `airtrust-storage` | idem |
| Rota pública | `airtrust-api-staging.airtrust.workers.dev` (workers.dev) | `api.airtrust.online` (custom domain) | `wrangler.toml` `[env.production] routes` |
| Pages (frontend) | Nenhum projeto dedicado — preview no projeto `airtrust`, branch `staging` (nunca `production`) | Projeto `airtrust`, branch `production`, domínio `airtrust.online` | `.github/workflows/deploy-staging.yml` vs `deploy-airtrust.yml`; confirmado em `docs/ops/staging-examiner-training-release-20260710.md` que não existe projeto Pages de staging oficial |
| Deploy workflow | `.github/workflows/deploy-staging.yml` (este PR) | `.github/workflows/deploy-airtrust.yml` | arquivos versionados |
| Confirmação de deploy | `AIRTRUST_STAGING` | `AIRTRUST_PRODUCTION` | inputs dos respectivos workflows — nunca reutilizados entre si |
| Cron triggers | Nenhum | `[env.production.triggers]` (EdApp, notificações, backups) | `wrangler.toml` |

Ambiente `development` (`airtrust-api-development`, `airtrust-db-dev` /
`a72fb05b-0912-4ad9-9686-e7948c8b09eb`) existe mas está fora do escopo deste
runbook — usado apenas para desenvolvimento local contra recurso remoto de dev.

## Injeção de versão (Worker)

`worker-airtrust/src/routes/system.ts` (`getCanonicalVersion`) resolve, nesta
ordem: `APP_VERSION` → `CF_DEPLOYMENT_ID` → `'dev-local'`. Valores placeholder
rastreados no git (`managed-by-script`, `__build_version__`, `__app_version__`, vazio, `null`,
`undefined`, `unknown`) são explicitamente rejeitados por
`sanitizeDeployMetadata` e tratados como ausentes — nunca aceitos como versão
real. `/api/version` retorna `{ version, environment, builtAt, deploymentId }`
sempre com headers no-cache.

O workflow `deploy-staging.yml` (job `deploy-worker`) gera
`worker-airtrust/wrangler.staging.toml` em tempo de execução (nunca commitado
— mesmo padrão de `wrangler.production.toml` em `deploy-airtrust.yml`),
substituindo `APP_VERSION`/`APP_BUILD_TIME` pelo SHA e timestamp UTC reais do
run, e falha explicitamente (step "Smoke provenance") se o `/api/version`
pós-deploy não contiver o SHA esperado, não reportar
`"environment":"staging"`, ou reportar qualquer um de
`dev-local`/`latest`/`main`/vazio.

## Frontend de staging

Não existe projeto Pages dedicado a staging (confirmado em
`docs/ops/staging-examiner-training-release-20260710.md`). Este PR formaliza,
em vez disso, um **preview estável e isolado** dentro do mesmo projeto Pages
(`airtrust`), usando a branch `staging` — nunca `production` (guard explícito
no workflow: `PAGES_STAGING_BRANCH` não pode ser `production`, e o comando de
deploy nunca inclui `--branch=production`). O build é stampado com
`APP_VERSION`/`build-version` (mesmo mecanismo de `scripts/stamp-build-version.sh`
já usado pelo deploy de produção) e configurado para apontar para a API de
staging via `VITE_DEV_PROXY_TARGET=https://airtrust-api-staging.airtrust.workers.dev`.

**Importante — isto é uma garantia de CI, não estrutural.** A separação entre
o preview de staging e `airtrust.online` (branch `production`) é imposta por
`PAGES_STAGING_BRANCH: staging` (um valor de `env:` no arquivo do workflow) e
por um passo de asserção dentro do próprio `deploy-staging.yml` — não por uma
restrição do lado do Cloudflare Pages que torne `--branch=production`
impossível de alcançar a partir deste workflow. Uma edição futura e descuidada
de `deploy-staging.yml` que altere `PAGES_STAGING_BRANCH` ou remova a
asserção poderia, em tese, reintroduzir o risco. Qualquer alteração nesse
trecho do workflow deve ser tratada com o mesmo rigor de revisão de uma
mudança em `deploy-airtrust.yml`.

Se, no futuro, um projeto Pages dedicado for provisionado, o único ajuste
necessário é o valor de `PAGES_PROJECT_NAME` no workflow — nenhuma mudança de
lógica. Esta execução **não provisiona** nenhum recurso Cloudflare novo; o
projeto Pages `airtrust` já existe e é reaproveitado apenas via uma branch
não-produção.

Rollback do frontend: como é um deployment de preview (não a branch
`production`), a mitigação é publicar um novo preview a partir de um SHA
anterior — não afeta `airtrust.online` enquanto o guard acima descrito
permanecer intacto no workflow.

## Rollback do Worker

`wrangler deployments list --name airtrust-api-staging` seguido de
`wrangler rollback <version-id> --env staging` apontando para a versão
anterior registrada no resumo do workflow (`worker_version_id` de execuções
anteriores, visível em `$GITHUB_STEP_SUMMARY`).
