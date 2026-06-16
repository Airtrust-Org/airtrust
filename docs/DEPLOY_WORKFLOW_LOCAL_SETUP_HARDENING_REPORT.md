# AirTrust - Hardening do workflow manual Deploy AirTrust sem deploy real

Data/hora UTC: 2026-06-16T01:45Z

## Veredito

`WORKFLOW MANUAL DEPLOY AIRTRUST HARDENED SEM DEPLOY REAL`

O workflow manual `Deploy AirTrust` foi corrigido para nao depender de `scripts/seed-local.sql` no setup local do job `Test & Build`. A etapa nao executou deploy real, nao acionou `workflow_dispatch` e nao tocou D1 remoto.

## Causa raiz

O job `Test & Build` do workflow `.github/workflows/deploy.yml` executava:

```bash
npm run setup:local:reset
```

Esse comando chama `scripts/setup-local-db.sh --reset`, que exige `scripts/seed-local.sql`. O arquivo `scripts/seed-local.sql` existe apenas localmente, esta listado no `.gitignore`, nao e rastreado por Git e nao deve ser adicionado ao CI por ser um seed amplo/local. No runner GitHub Actions, o arquivo nao existe; por isso o workflow manual falhou no passo `Setup local database` antes de qualquer deploy.

## Arquivos alterados

- `.github/workflows/deploy.yml`
  - Troca o setup local do job `Test & Build` de `npm run setup:local:reset` para `npm run setup:lms:local:reset`.
  - Mantem intactos os guardrails de producao, incluindo `production_confirmation`, gates de `deploy_worker`, `deploy_pages` e `apply_production_migrations`.
- `scripts/validation/audit-deploy-scripts.sh`
  - Adiciona guarda para falhar se o workflow `Deploy AirTrust` voltar a usar `setup:local:reset`.
  - Confirma que o workflow usa `setup:lms:local:reset`.
- `docs/DEPLOY_WORKFLOW_LOCAL_SETUP_HARDENING_REPORT.md`
  - Registra a fase, causa raiz, validacoes e confirmacoes negativas.

## Justificativa da correcao

O workflow usa o banco local para subir o Worker local e executar `npm run smoke:lms:local`. O setup sintetico `setup:lms:local:reset` ja existe, e foi criado exatamente para o smoke LMS sem depender do seed amplo `scripts/seed-local.sql`.

A mudanca e estreita: nao altera jobs de deploy, nao remove confirmacoes de producao, nao altera secrets, nao ativa flags e nao adiciona comandos remotos.

## Confirmacoes de seguranca

- Deploy executado: `NAO`.
- Workflow manual disparado: `NAO`.
- `wrangler deploy` executado: `NAO`.
- `wrangler pages deploy` executado: `NAO`.
- `wrangler d1 migrations apply` executado: `NAO`.
- `wrangler d1 execute` executado nesta etapa: `NAO`.
- Migrations aplicadas: `NAO`.
- 0410/0411 reexecutadas: `NAO`.
- Flags SIGVOOS ativadas: `NAO`.
- API real SIGVOOS chamada: `NAO`.
- Credenciais SIGVOOS usadas: `NAO`.
- FRMS alterado: `NAO`.
- `frms-source-policy.ts` alterado: `NAO`.
- Emails enviados: `NAO`.
- RBAC backend/multi-tenant real alterado: `NAO`.
- Secrets, dumps, snapshots ou dados reais adicionados: `NAO`.

## Validacoes executadas

```bash
env -u VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED -u CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED npx tsc --noEmit --pretty false
env -u VITE_SIGVOOS_REFRESH_PREVIEW_ENABLED -u CONTROLE_VOOS_SIGVOOS_RUNTIME_PREVIEW_ENABLED npm run build
git diff --check
bash scripts/check-tracked-secrets.sh
bash scripts/validation/audit-deploy-scripts.sh
bash scripts/audit-dangerous-ops.sh
```

Resultados:

- Typecheck: `PASS`.
- Build: `PASS`.
- `git diff --check`: `PASS`.
- `scripts/check-tracked-secrets.sh`: `PASS`.
- `scripts/validation/audit-deploy-scripts.sh`: `PASS`.
  - Inventariou referencias historicas a `migrations apply`.
  - Confirmou `deploy-worker-safe` sem comandos proibidos.
  - Confirmou `Deploy AirTrust` usando setup local sintetico sem `seed-local.sql`.
- `scripts/audit-dangerous-ops.sh`: `PASS`, com warning inventarial pre-existente sobre scripts remotos que exigem revisao.

## Validacao nao executada por regra de escopo

Nao foi executado `npm run setup:lms:local:reset`, porque esse script usa `npx wrangler d1 execute ... --local` internamente, e a regra absoluta da fase proibe `wrangler d1 execute`. A validacao desta fase ficou no nivel de workflow/script/auditoria/build, sem D1 local ou remoto.

## Proxima recomendacao

Em uma fase separada e explicitamente autorizada para D1 local, executar um dry-run operacional do job `Test & Build` ou do par `npm run setup:lms:local:reset` + `npm run smoke:lms:local`, sem habilitar `deploy_worker`, `deploy_pages` ou `apply_production_migrations`.
