# AIRTRUST TRAINING CLASS MANAGEMENT DEPLOY 2026-06-06

## Escopo

Publicacao do pacote de gestao de turmas multi-dia, instrutores por turma, emissao idempotente de qualificacoes geradas e visao mensal integrada de escalas.

## Base publicada

- branch: `main`
- commit de codigo publicado: `274250c1e232463e858135af3d6a22502fe3a41d`
- mensagem: `feat(training): add multi-day class management and qualification issuance`

## Validacao local antes da publicacao

- `npm run build`: OK
- `npm run lint`: OK
- `npx tsc --noEmit`: OK
- `npm run test:worker`: OK (`146` arquivos / `940` testes)

## Ajuste de seguranca feito antes do apply remoto

- a migration `0390_training_class_management.sql` foi mantida estritamente aditiva
- foram removidos backfills e updates de legado da migration
- a compatibilidade com registros legados foi movida para runtime
- a geracao de `treinamentos_qualificacoes_geradas` deixou de usar `INSERT OR IGNORE` cego e passou a usar ensure idempotente com readback

## Estado remoto antes do apply

- `wrangler d1 migrations list DB --env production --remote`
- pendentes encontradas:
  - `0389_platform_roles_support_access_foundation.sql`
  - `0390_training_class_management.sql`
- tabelas-alvo `0389/0390` ainda ausentes em producao

## Backup pre-apply

- dump completo D1:
  - `/Users/filipedaumas/SAAS/Airtrust/artifacts/db-backups/airtrust-db-production-pre-apply-20260606T1538-0300.sql`
- tamanho local baixado: `97M`

## Apply remoto D1

Comando executado:

```bash
wrangler d1 migrations apply DB --env production --remote
```

Resultado:

- `0389_platform_roles_support_access_foundation.sql`: aplicada com sucesso
- `0390_training_class_management.sql`: aplicada com sucesso

Ledger remoto apos apply:

- `0389_platform_roles_support_access_foundation.sql` -> `id=386`, `applied_at=2026-06-06 18:38:34`
- `0390_training_class_management.sql` -> `id=387`, `applied_at=2026-06-06 18:38:35`

Schema remoto confirmado apos apply:

- tabelas:
  - `user_platform_roles`
  - `support_access_grants`
  - `support_access_sessions`
  - `treinamentos_dias`
  - `treinamentos_instrutores`
  - `treinamentos_qualificacoes_geradas`
- indexes confirmados:
  - `idx_user_platform_roles_active_unique`
  - `idx_support_access_grants_active_unique`
  - `idx_support_access_sessions_active`

## Deploy backend

Comando executado:

```bash
npm run deploy:worker:safe
```

Resultado:

- worker: `airtrust-api-production`
- `APP_VERSION=2026-06-06T18:38:55Z-274250c`
- `APP_BUILD_TIME=2026-06-06T18:38:55Z`
- `Current Version ID: 623651ec-90e6-44cb-8993-351e1f9317e1`

## Smoke backend

- `bash scripts/smoke-production-readonly.sh`: OK
- `BASE=https://api.airtrust.online bash scripts/smoke-test-core.sh`: OK
  - sem credenciais, validou apenas health publico
- `bash scripts/smoke-tests.sh https://api.airtrust.online`: OK (`5/5`)

Confirmacao publica:

- `https://api.airtrust.online/api/version` respondeu `200`
- `version=2026-06-06T18:38:55Z-274250c`

## Deploy frontend

Comando executado:

```bash
npm run deploy:pages
```

Resultado:

- deploy Pages concluido
- URL de deploy: `https://7b3c95c0.airtrust.pages.dev`
- `https://airtrust.online` respondeu `200`
- HTML publicado contem `<meta name="build-version" content="274250c" />`

## Classificacao final

`PUBLICADO COM LIMITACOES NAO CRITICAS`

## Limitacoes residuais nao criticas

- o typecheck dedicado do worker ainda possui `8` erros preexistentes no dominio FRMS; nao foram introduzidos por este pacote e a suite funcional completa passou
- o smoke autenticado continua manual porque nao havia credenciais de smoke nesta sessao
- a fila remota exigiu apply conjunto de `0389` e `0390`; nao era possivel publicar apenas `0390` com o fluxo padrao de D1

## Conclusao

Pacote publicado com sucesso em backend, frontend e schema remoto, com backup pre-apply preservado e smoke publico aprovado.
