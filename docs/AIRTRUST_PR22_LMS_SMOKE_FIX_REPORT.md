# AirTrust PR #22 - LMS Smoke Fix Report

Data: 2026-06-15
Branch: `codex/airtrust-sanitization-final-preflight`
PR: #22

## Veredito

`LMS-SMOKE CORRIGIDO`

O `lms-smoke` foi reproduzido localmente e passou de ponta a ponta com banco D1 local, Worker local e seed sintetico minimo.

## Causa raiz

O job `lms-smoke` executava `npm run setup:local:reset`, que chama `scripts/setup-local-db.sh --reset`.

Esse setup exige `scripts/seed-local.sql`, mas esse arquivo:

- existe apenas localmente;
- tem aproximadamente 19 MB;
- esta listado em `.gitignore`;
- nao esta versionado no PR;
- nao deve ser adicionado ao CI como seed amplo/dump.

Depois de substituir o setup amplo por um setup local minimo do LMS, o smoke revelou uma falha real no endpoint LMS: `POST /api/lms/matriculas` referenciava `dataExpiracao` sem declarar a variavel. A correcao pontual passou a usar `data_expiracao ?? null`, que ja e o campo validado pelo schema da rota.

## Arquivos alterados

- `.github/workflows/ci.yml`
  - Troca o setup do job `lms-smoke` de `npm run setup:local:reset` para `npm run setup:lms:local:reset`.
- `package.json`
  - Adiciona o script `setup:lms:local:reset`.
- `scripts/setup-local-lms-smoke-db.sh`
  - Cria setup local especifico para o smoke LMS.
  - Aplica `schema-local.sql`, migrations LMS locais existentes e seed sintetico minimo.
  - Garante colunas locais necessarias quando o schema local versionado esta defasado.
- `scripts/seed-local-lms-smoke.sql`
  - Adiciona somente empresa, funcionario, qualificacao EAD e usuario admin sinteticos para o smoke local.
  - Nao contem dado real, dump, snapshot, export ou seed de producao.
- `worker-airtrust/src/routes/lms-matriculas.ts`
  - Corrige referencias a `dataExpiracao` nao declarada para `data_expiracao ?? null`.

## Validacoes locais

- `git diff --check`: PASS
- `cd worker-airtrust && npm ci --ignore-scripts`: PASS
- `npm run setup:lms:local:reset`: PASS
- `npm run smoke:lms:local`: PASS
- `npx tsc --noEmit --pretty false`: PASS
- `bash scripts/check-tracked-secrets.sh`: PASS
- `bash scripts/validation/audit-deploy-scripts.sh`: PASS como inventario; listou referencias historicas ja existentes a `migrations apply`, e confirmou `deploy-worker-safe` sem comandos proibidos.
- `bash scripts/audit-dangerous-ops.sh`: PASS com aviso historico sobre scripts read-only/sync ja existentes.
- `npm run check:demo-data`: PASS
- `cd worker-airtrust && npx vitest run src/__tests__/migrations/migration-governance.test.ts src/__tests__/migrations/regulated-records-core-experimental.test.ts src/__tests__/lib/regulated-records/governance-evidence-service.test.ts`: PASS, 39 tests.

## Status remoto dos checks

Antes do push desta correcao, o unico check vermelho do PR #22 era:

- `lms-smoke`: FAILURE

Checks verdes antes do push:

- `build`: SUCCESS
- `check-demo-data`: SUCCESS
- `lint`: SUCCESS
- `test`: SUCCESS
- `Check PR`: SUCCESS

O status remoto apos o push desta correcao deve ser consultado nos checks do PR #22. Como este relatorio faz parte do mesmo commit que dispara os checks, o resultado final remoto sera reportado fora do arquivo, na resposta operacional apos o push.

## Confirmacoes de seguranca

- Nao houve merge do PR.
- Nao houve deploy.
- Nao houve migration remota.
- Nao houve acesso a staging.
- Nao houve acesso a producao.
- Nao houve Cloudflare remoto, D1 remoto, R2 remoto ou leitura/escrita de secrets.
- Nao foi criada migration `0411`.
- Nao houve alteracao em SIGVOOS, FRMS, RBAC, multi-tenant ou Controle de Voos.
- Nao houve alteracao de regulated records.
- Nao foi usado `git add .` nem `git add -A`.

## Recomendacao

Pronto para revisao humana apos o push e confirmacao de que o `lms-smoke` remoto ficou verde.
