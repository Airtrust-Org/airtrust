# AIRTRUST PAGES RELEASE RECOVERY 2026-06-23

Decisao final:
`ENVIRONMENT SECRET OVERRIDES REPO SECRET — ALINHAR SECRETS`

Decisao complementar:
`WORKTREE CLEANUP COMPLETE — RELEASE STILL BLOCKED`

## Resumo executivo

- `origin/main` esta em `c1420fafc590a6f9cf3f1cc7ce7f7e1fb80757b2`.
- O Worker de producao ja foi publicado neste commit e o backend publico responde como esperado.
- O frontend de `airtrust.online` continua preso no build `ae870a7`.
- `main.airtrust.pages.dev` continua servindo o build `1802e23`.
- O bloqueio atual nao e de pipeline de build; e de divergencia entre o token do repo e o token do environment `production`.

## Git e PRs

Confirmacoes relevantes no GitHub:

- PR #143 `codex/frms-quinzena-ux-acumulo-20260623` mergeado em `2026-06-23T20:43:06Z`
- PR #144 `codex/hotfix-lms-aw139-progress-reset-20260623` mergeado em `2026-06-23T23:09:33Z`
- PR #145 `codex/fix-worker-deploy-workflow-app-version-20260623` mergeado em `2026-06-23T23:17:54Z`
- PR #146 `codex/qualificacoes-conclusao-lote-20260623` mergeado em `2026-06-23T23:27:23Z`
- PR #147 `codex/fix-worker-deploy-deps-20260623` mergeado em `2026-06-23T23:38:55Z`

PRs abertos relevantes mantidos:

- PR #140 `Docs: registrar fechamento operacional do hotfix #139`
- PR #130 `ops: harden validation and release platform`

Nao fechei PRs abertos automaticamente porque os pendentes restantes nao sao descartaveis com confianca dentro deste ciclo.

## Secrets e workflow

Repositorio GitHub:

- Secret de repositorio presente: `CLOUDFLARE_ACCOUNT_ID`
- Secret de repositorio presente: `CLOUDFLARE_API_TOKEN`
- Secret no environment `production`: `CLOUDFLARE_ACCOUNT_ID`
- Secret no environment `production`: `CLOUDFLARE_API_TOKEN`

Workflow:

- Arquivo auditado: `.github/workflows/deploy.yml`
- Os jobs `deploy-worker` e `deploy-pages` rodam sob `environment: production`.
- Ambos referenciam `secrets.CLOUDFLARE_API_TOKEN` e `secrets.CLOUDFLARE_ACCOUNT_ID`; com secrets homonimos no repositorio e no environment, o valor efetivo de producao precisa ser tratado como potencialmente vindo do escopo `production`.
- O comando efetivo de Pages e:
  `wrangler pages deploy dist/client --project-name=airtrust --branch=production --commit-hash=${GITHUB_SHA}`

Marcadores objetivos:

- `USES_ENVIRONMENT_PRODUCTION=yes`
- `REPO_SECRET_TOKEN_PRESENT=yes`
- `ENV_SECRET_TOKEN_PRESENT=yes`
- `REPO_ACCOUNT_ID_PRESENT=yes`
- `ENV_ACCOUNT_ID_PRESENT=yes`

## Evidencia do bloqueio de Pages

Runs relevantes:

- Run `28064575499` em `2026-06-23T23:39:18Z`: sucesso, mas `deploy_pages` estava desligado; o job `Deploy Pages` foi `skipped`.
- Run `28064750699` em `2026-06-23T23:43:17Z`: falha ao tentar publicar Pages para o commit `c1420fafc590a6f9cf3f1cc7ce7f7e1fb80757b2`.

Erro objetivo no run `28064750699`:

- chamada a `/accounts/{account}/pages/projects/airtrust` falhou com `Authentication error [code: 10000]`
- o proprio Wrangler registrou `Unable to get membership roles`
- o token autenticou como usuario valido, mas sem permissao suficiente para Pages/membership read no account alvo

Conclusao tecnica:

- o token efetivo de `production` consegue operar Worker, mas nao consegue operar Pages no projeto `airtrust`
- o gargalo esta fora do codigo do produto e fora do build artifact
- o workflow nao esta usando o mesmo token do escopo de repositorio

## Smoke publico

Frontend publico:

- `https://airtrust.online/login` responde `200`
- `https://airtrust.online/sw.js` responde `200`
- `sw.js` publicado confirma kill switch de descomissionamento
- `https://airtrust.online/login` expõe `build-version` `ae870a7`
- `https://main.airtrust.pages.dev/` expõe `build-version` `1802e23`

Backend publico:

- `https://api.airtrust.online/api/version` -> `200`
- `https://api.airtrust.online/api/health` -> `200`
- `https://api.airtrust.online/api/lms/matriculas` sem token -> `401`
- `https://api.airtrust.online/api/treinamentos-planejados` sem token -> `401`

Limitacoes registradas:

- nao houve sessao autenticada segura disponivel para validar `/qualificacoes` e `/frms` em runtime autenticado
- em SPA publica, `curl` em `/dashboard` e `/mro` retorna HTML `200`; sem browser autenticado nao fechei a validacao de redirecionamento client-side

## Worktrees e higiene operacional

- O saneamento de worktrees foi executado em paralelo e documentado em `docs/AIRTRUST_WORKTREE_CLEANUP_20260623.md`
- Patches de preservacao foram salvos em `docs/worktree-archive/20260623/`
- Nenhuma worktree com alteracao nao classificada foi apagada

## Causa raiz

Raiz confirmada:

- permissao insuficiente do `CLOUDFLARE_API_TOKEN` para Cloudflare Pages no account/projeto `airtrust`

Raiz descartada:

- falha de build
- falha de artefato frontend
- falta de secret no repositorio
- falha no deploy Worker

## Diagnostico definitivo do token usado pelo runner

Workflow temporario seguro publicado em `main`:

- `.github/workflows/debug-cloudflare-token.yml`
- run id: `28128243848`
- commit do workflow: `8b07b1a2f8dc2ae3af7274b98c2f865648474c9a`

Resultado do job sem environment (`repo`):

- `TOKEN_FINGERPRINT=293d09fa285a`
- `ACCOUNT_ID_FINGERPRINT=6c291323f8f2`
- `WHOAMI=pass`
- `MEMBERSHIPS_HTTP=200`
- `MEMBERSHIPS_SUCCESS=true`
- `WORKER_SERVICE_HTTP=403`
- `WORKER_SERVICE_SUCCESS=false`
- `PAGES_PROJECT_HTTP=200`
- `PAGES_PROJECT_SUCCESS=true`
- `PAGES_DEPLOYMENTS_HTTP=200`
- `PAGES_DEPLOYMENTS_SUCCESS=true`

Classificacao do secret de repositorio:

- `RUNNER TOKEN PAGES OK`
- nao e account mismatch
- `project-name=airtrust` esta correto

Resultado do job com `environment: production`:

- `TOKEN_FINGERPRINT=59c3a2acd180`
- `ACCOUNT_ID_FINGERPRINT=6c291323f8f2`
- `WHOAMI=pass`
- `MEMBERSHIPS_HTTP=403`
- `MEMBERSHIPS_SUCCESS=false`
- `WORKER_SERVICE_HTTP=200`
- `WORKER_SERVICE_SUCCESS=true`
- `PAGES_PROJECT_HTTP=403`
- `PAGES_PROJECT_SUCCESS=false`
- `PAGES_DEPLOYMENTS_HTTP=403`
- `PAGES_DEPLOYMENTS_SUCCESS=false`

Classificacao do secret efetivo de `production`:

- `RUNNER TOKEN WORKER ONLY — SECRET VALUE WRONG`

Conclusao definitiva:

- o `ACCOUNT_ID` e o mesmo nos dois escopos
- o nome do projeto Pages `airtrust` esta correto
- o secret do environment `production` sobrescreve o secret do repositorio nos jobs de deploy
- o secret do repositorio acessa Pages
- o secret do environment `production` acessa Worker, mas falha em memberships e Pages com `403` / `10000`
- portanto, o deploy de Pages quebra porque o runner usa o token do environment `production`, nao o token do repositorio

## Recuperacao do token original

Resultado:

- `TOKEN ORIGINAL ENCONTRADO MAS SEM PAGES` para o escopo `production`
- `ENVIRONMENT SECRET OVERRIDES REPO SECRET — ALINHAR SECRETS`

Fontes verificadas sem expor valores:

- `.env*` da raiz do repo
- `worker-airtrust/.env*`
- `.dev.vars` da raiz e do worker
- `scripts/*`
- `docs/worktree-archive/20260623/*`
- worktrees preservadas listadas no saneamento operacional
- ambiente atual do shell desta sessao

Achados objetivos:

- `.env.production`, `.env.local`, `.env.local.production`, `.env.test` e `worker-airtrust/.env.example` nao contem variaveis Cloudflare preenchidas.
- O unico `CLOUDFLARE_ACCOUNT_ID` local reaproveitavel apareceu repetido em `.env.example` das copias do repo.
- Os unicos `CLOUDFLARE_API_TOKEN` encontrados em arquivos locais estavam em `.env.example` e scripts legados/arquivados.
- Todos os candidatos distintos extraidos de arquivos falharam em `wrangler whoami`, `memberships`, Worker e Pages.
- O ambiente atual da sessao possui `CLOUDFLARE_API_TOKEN` exportado, mas esse token so passa em `wrangler whoami`; falha em `memberships`, `workers/services/airtrust-api-production` e `pages/projects/airtrust`.

Classificacao consolidada:

- candidatos de arquivo: `TOKEN_INVALID`
- token exportado no shell desta sessao: `TOKEN_INVALID`

Leitura operacional:

- o valor efetivo usado pelo runner em `production` e diferente do valor do repo secret
- a divergencia nao esta em `ACCOUNT_ID`; os fingerprints do account batem
- o problema nao e `project-name`
- o problema e o `CLOUDFLARE_API_TOKEN` salvo no environment `production`

Acao manual necessaria:

- alinhar o `CLOUDFLARE_API_TOKEN` do environment `production` ao valor correto para release completo
- como o repo secret ja prova acesso a Pages, a acao minima e copiar o token Pages-valido para o environment `production`
- depois do alinhamento, rerodar `debug-cloudflare-token.yml` e confirmar fingerprint igual entre `repo` e `production`
- somente depois disso rerodar `Deploy AirTrust` com `deploy_pages=true` e `deploy_worker=false`

## Proxima acao necessaria

Para sair do bloqueio:

- atualizar o `CLOUDFLARE_API_TOKEN` do environment `production`
- manter `CLOUDFLARE_ACCOUNT_ID` atual
- nao alterar `--project-name=airtrust`
- reenfileirar `debug-cloudflare-token.yml` para confirmar o alinhamento
- reenfileirar `Deploy AirTrust` em `main` com `deploy_pages=true` e `deploy_worker=false`

## Seguranca operacional

- sem SQL
- sem migration/schema
- sem alteracao em `worker-airtrust/src/lib/frms/frms-source-policy.ts`
- sem toque em SIGVOOS/SegVoo
- sem exposicao de secrets

## Atualizacao 2026-06-24 — split de tokens implementado

Decisao operacional adotada apos este diagnostico:

`TOKEN SPLIT IMPLEMENTED — MANUAL SECRET ALIGNMENT REQUIRED`

Em vez de tentar reusar um unico `CLOUDFLARE_API_TOKEN` generico para Worker e Pages
(cuja divergencia de permissao foi a causa raiz acima), a arquitetura de release passa
a usar tokens explicitos por finalidade. Mudancas aplicadas em codigo/pipeline:

- `.github/workflows/deploy.yml`:
  - `deploy-worker` (e o passo de migrations D1) usa `CLOUDFLARE_WORKER_API_TOKEN`;
  - `deploy-pages` usa `CLOUDFLARE_PAGES_API_TOKEN`;
  - ambos continuam usando `CLOUDFLARE_ACCOUNT_ID`;
  - o `CLOUDFLARE_API_TOKEN` generico nao e mais referenciado nos jobs de deploy de
    producao (fica como secret **legado** ate confirmacao dos novos tokens).
- `.github/workflows/debug-cloudflare-token.yml` reescrito para validar os dois tokens
  separadamente, sob `environment: production`:
  - job `diagnose-worker-token` -> veredito `WORKER_TOKEN_OK` / `WORKER_TOKEN_BLOCKED`;
  - job `diagnose-pages-token` -> veredito `PAGES_TOKEN_OK` / `PAGES_TOKEN_BLOCKED`;
  - nunca imprime o valor do token (apenas fingerprint sha256[:12]) e nao faz deploy.

Politicas permanentes registradas:

- `docs/AIRTRUST_RELEASE_OPERATIONS_POLICY_20260624.md` (Worker/Pages separados,
  secrets separados, preflight + smoke, gates de migration e SIGVOOS).
- `docs/AIRTRUST_GIT_WORKTREE_AND_RELEASE_POLICY_20260624.md` + `scripts/ops-worktree-audit.sh`.

### Acao manual ainda necessaria (nao executavel por agente)

1. No environment `production` do GitHub:
   - salvar o token Worker valido como `CLOUDFLARE_WORKER_API_TOKEN`;
   - salvar o token Pages valido como `CLOUDFLARE_PAGES_API_TOKEN`;
   - manter `CLOUDFLARE_ACCOUNT_ID`.
2. Rodar `Debug Cloudflare Token` e exigir `WORKER_TOKEN_OK` e `PAGES_TOKEN_OK`.
3. Somente com `PAGES_TOKEN_OK`, rodar `Deploy AirTrust` em `main` com
   `deploy_pages=true` e `deploy_worker=false`.
4. Confirmar smoke (`/login`, `/sw.js`, `/frms`, `/qualificacoes`, build-version fora
   de `ae870a7`).

Nenhum deploy de Worker/Pages foi disparado nesta etapa.
