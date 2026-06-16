# AirTrust - Deploy controlado do runtime SIGVOOS preview com flags desligadas

Data/hora UTC: 2026-06-16T01:29Z

## Veredito

`DEPLOY RUNTIME SIGVOOS COM FLAGS DESLIGADAS OK`

O runtime do preview SIGVOOS foi publicado em producao com as flags desligadas. O comportamento padrao do usuario permanece sem acionamento de preview SIGVOOS: o botao `Atualizar app` continua como hard refresh quando `VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED` nao esta `true`.

## Versao implantada

- Commit implantado: `14e9f9ca9bb76fe4d6108a8f14ced9360955deca`
- Worker `APP_VERSION`: `2026-06-16T01:27:29Z-14e9f9ca`
- Worker `APP_BUILD_TIME`: `2026-06-16T01:27:29Z`
- Worker Version ID: `1e178a10-28d1-400d-892f-05f3b35290ae`
- Pages deploy URL: `https://ccfcad40.airtrust.pages.dev`

## Comandos e workflow usados

Tentativa inicial pelo workflow manual aprovado:

```bash
gh workflow run deploy.yml --ref main -f deploy_worker=true -f deploy_pages=true -f apply_production_migrations=false -f production_confirmation='I understand this touches AirTrust production'
```

Resultado: workflow `27587739195` falhou antes de qualquer deploy no passo `Setup local database`, por `seed-local.sql nao encontrado em /home/runner/work/airtrust/airtrust/scripts`. Os jobs `Deploy Worker` e `Deploy Pages` ficaram `skipped`. Nenhuma migration foi executada nesse workflow.

Deploy efetivo feito pelo mecanismo seguro local ja existente:

```bash
env -u VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED -u CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED -u APP_VERSION npm run deploy:worker:safe
env -u VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED -u CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED npm run deploy:pages
```

O comando `npm run deploy:worker:safe` executa apenas `wrangler deploy --env production --config <wrangler temporario>` com version stamp. O comando `npm run deploy:pages` executa preflight limpo, build e `wrangler pages deploy dist/client --project-name=airtrust --branch=production`. Nenhum dos dois comandos aplica migration, executa `wrangler d1 migrations apply`, executa `wrangler d1 execute`, seed, sync, deduplicate ou importacao.

## Flags desligadas

Confirmado antes e depois do deploy:

- `VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED`: nao definido no ambiente dos comandos de build/deploy.
- `CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED`: nao definido no ambiente dos comandos de build/deploy.
- `worker-airtrust/wrangler.toml`: producao nao define `CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED`.
- `.github/workflows/deploy.yml`: build usa apenas `VITE_APP_VERSION=${{ github.sha }}`; nao injeta `VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED=true`.
- Bundle Pages publicado: contem leitura condicional de `VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED`, mas nao contem o fragmento literal `VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED=true`.
- Worker deploy listou bindings de producao sem flag SIGVOOS:
  - `ENVIRONMENT`
  - `APP_VERSION`
  - `APP_BUILD_TIME`
  - `SIMULATOR_SHARED_SESSIONS_ENABLED`

## Confirmacoes negativas

- API real SIGVOOS chamada: `NAO`.
- Credenciais SIGVOOS usadas: `NAO`.
- Sync real SIGVOOS executado: `NAO`.
- Escrita SIGVOOS executada: `NAO`.
- Payload SIGVOOS real inserido: `NAO`.
- Migration aplicada: `NAO`.
- `wrangler d1 migrations apply` executado: `NAO`.
- Migration `0410` reexecutada: `NAO`.
- Migration `0411` reexecutada: `NAO`.
- Secret SIGVOOS criado/alterado: `NAO`.
- FRMS alterado: `NAO`.
- `frms-source-policy.ts` alterado: `NAO`.
- Emails enviados: `NAO`.
- RBAC backend/multi-tenant real alterado: `NAO`.

## Validacoes pre-deploy

Estado Git:

- `main` alinhado com `origin/main`.
- HEAD: `14e9f9ca9bb76fe4d6108a8f14ced9360955deca`.
- Divergencia `origin/main...HEAD`: `0 0`.
- PR #45 presente no topo do historico: `Merge PR #45: Gatilho controlado SIGVOOS no Atualizar app`.
- Working tree limpa antes do deploy.
- Stage vazio antes do deploy.
- CI pos-merge do PR #45: checks principais `CI`, `Tests`, `Lint and Prettier Check` e `Demo Data Prevention Check` passaram.
- `Deploy to GitHub Pages` continuou falhando no padrao pre-existente fora do escopo.
- Nao havia execucao `workflow_dispatch` anterior do workflow manual `Deploy AirTrust` em `main`.

Comandos locais:

```bash
env -u VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED -u CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED npx tsc --noEmit --pretty false
env -u VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED -u CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED npm run build
git diff --check
bash scripts/check-tracked-secrets.sh
bash scripts/validation/audit-deploy-scripts.sh
bash scripts/audit-dangerous-ops.sh
cd worker-airtrust && env -u VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED -u CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED npx vitest run src/__tests__/routes/controle-voos.test.ts
env -u VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED -u CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED npx vitest run src/react-app/components/__tests__/AppLayout.hard-refresh.test.tsx
```

Resultados:

- Typecheck: `PASS`.
- Build: `PASS`.
- `git diff --check`: `PASS`.
- `scripts/check-tracked-secrets.sh`: `PASS`.
- `scripts/validation/audit-deploy-scripts.sh`: `PASS` como inventario; listou referencias historicas a migrations e confirmou `deploy-worker-safe` sem tokens proibidos.
- `scripts/audit-dangerous-ops.sh`: `PASS` com warning inventarial pre-existente sobre scripts remotos que exigem revisao.
- `worker-airtrust/src/__tests__/routes/controle-voos.test.ts`: `PASS`, 40/40.
- `src/react-app/components/__tests__/AppLayout.hard-refresh.test.tsx`: `PASS`, 2/2.
- Testes confirmaram botao sem flag sem chamada preview, preview backend com flag desligada retornando `FEATURE_DISABLED`, bloqueio de usuario comum no preview e ausencia de escrita real.

## Validacoes pos-deploy

Read-only/API:

```bash
curl -fsS https://api.airtrust.online/api/health
curl -fsS https://api.airtrust.online/api/version
curl -fsSI https://ccfcad40.airtrust.pages.dev/
curl -s -o /tmp/sigvoos-preview-noauth.txt -w '%{http_code}' -X POST https://api.airtrust.online/api/controle-voos/sigvoos/sync-preview
```

Resultados:

- API health: `success=true`, database `ok`, storage `ok`, `version=2026-06-16T01:27:29Z-14e9f9ca`.
- API version: `version=2026-06-16T01:27:29Z-14e9f9ca`, `environment=production`, `builtAt=2026-06-16T01:27:29Z`.
- Pages: HTTP `200`.
- Preview SIGVOOS sem token: HTTP `401`, `MISSING_TOKEN`. Usuario comum sem autenticacao nao alcanca o preview.
- Validacao local de usuario autorizado com flag backend desligada: `FEATURE_DISABLED`, sem escrita.

Bundle Pages publicado:

- `VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED`: 2 ocorrencias como leitura condicional.
- `CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED`: 0 ocorrencias.
- `/controle-voos/sigvoos/sync-preview`: 1 ocorrencia.
- `Previa SIGVOOS desativada por flag.`: 1 ocorrencia.
- Fragmento `VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED=true`: ausente.

Read-only D1 snapshots pos-deploy:

- `cv_sigvoos_staging`: `0`
- `cv_voos`: `0`
- `cv_voo_etapas`: `0`
- `cv_conflitos_integracao`: `0`
- `frms_jornada`: `5262`
- `frms_alerta`: `4899`
- `frms_fadiga_checkin`: `63`
- `frms_importacao_fira`: `1058`

Todas as consultas D1 pos-deploy retornaram `rows_written=0` e `changed_db=false`. A primeira tentativa de snapshot com `UNION ALL` falhou por limitacao do wrapper D1 (`too many terms in compound SELECT`) e foi refeita com `SELECT COUNT(*)` separados, sem DDL/DML.

## Ressalvas

- O workflow manual `Deploy AirTrust` falhou antes do deploy por falta de `scripts/seed-local.sql` no runner. O deploy foi executado pelo caminho local seguro existente, auditado nesta etapa.
- Validacao de login real em producao nao foi executada por nao usar credenciais de usuario. Foram validados carregamento HTTP do Pages, API health/version e bloqueio do endpoint preview sem token. A validacao funcional do endpoint autorizado com flag desligada foi coberta por teste local direcionado.
- Nao houve baseline pre-deploy de contagens D1 coletado nesta execucao. A garantia de ausencia de escrita vem dos comandos de deploy sem D1/migration, dos testes direcionados e dos snapshots read-only pos-deploy com `rows_written=0`/`changed_db=false`.

## Proxima recomendacao

Corrigir o workflow manual `Deploy AirTrust` em fase separada para que o passo `setup:local:reset` nao dependa de `scripts/seed-local.sql` ausente no runner. Manter ambas as flags SIGVOOS desligadas ate uma nova etapa explicita de ativacao controlada.
