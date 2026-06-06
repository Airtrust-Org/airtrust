# AIRTRUST - Validacao de Deploy (Escalas + Treinamentos + Integracoes)
Data: 2026-06-06  
Commit publicado de codigo: `23f893e684f80f29a2789dd41542e36aa5964203`

## Pre-deploy local

| Gate | Resultado |
|---|---|
| `npx tsc --noEmit` | OK |
| `npx tsc -p worker-airtrust/tsconfig.json --noEmit` | OK |
| `npm run lint` | OK |
| `npm run build` | OK |
| `npm run test:run` | OK: 62 arquivos passados, 3 skipped, 556 testes |
| `npm run test:worker` | OK: 146 arquivos, 956 testes |

## Deploy

| Etapa | Status | Evidencia |
|---|---|---|
| Merge/fast-forward para `main` | OK | `main` atualizado de `83f3fb5` para `23f893e` por `git merge --ff-only fix/escalas-treinamentos-remediation`. |
| Push `main` | OK | `git push origin main`: `83f3fb5..23f893e main -> main`. |
| Deploy Worker | OK | `npm run deploy:worker:safe`; `APP_VERSION=2026-06-06T20:51:38Z-23f893e`; Version ID `f2b9288d-8d13-4306-8cfb-89b60f8cd3a5`. |
| Deploy Pages | OK | `npm run deploy:pages`; deployment `https://d4e548cc.airtrust.pages.dev`; `dist/client/index.html` carimbado com `23f893e`. |
| Smoke read-only API/frontend | OK | `scripts/smoke-production-readonly.sh`: PASS; web root 200; dashboard route 200; API version 200; `APP_VERSION=2026-06-06T20:51:38Z-23f893e`. |
| Smoke core | OK limitado | `BASE=https://api.airtrust.online bash scripts/smoke-test-core.sh`: Health OK; credenciais ausentes, limitado a health publico. |
| Smoke geral API | OK | `bash scripts/smoke-tests.sh https://api.airtrust.online`: 5/5 passed, 0 failed. Endpoint protegido respondeu 401 como esperado. |
| Smoke frontend publico | OK | `https://airtrust.online/` e `https://d4e548cc.airtrust.pages.dev/` responderam 200, 2475 bytes, HTML contem `23f893e`. |
| Smoke autenticado operacional | Limitado | `bash scripts/smoke-authenticated-operational.sh`: PASS=3, FAIL=0, SKIPPED=1; leitura autenticada pulada por ausencia de `AIRTRUST_AUTH_TOKEN` ou `AIRTRUST_COOKIE`. |

## Health de producao

`https://api.airtrust.online/api/health` respondeu HTTP 200:

- `status`: `healthy`
- `database`: `ok`, latencia 361 ms
- `storage`: `ok`, latencia 155 ms
- `environment`: `production`
- `version`: `2026-06-06T20:51:38Z-23f893e`
- latencia total reportada: 516 ms

## Limitacoes

- Smoke autenticado/write smoke nao foi executado: nenhuma credencial/token/cookie de smoke estava configurado no ambiente local.
- Nenhuma migration/backfill foi executada, logo nao houve validacao de migracao.
- `post-deploy-verify.sh` nao foi usado como gate porque referencia endpoints/dominios antigos e trata endpoints autenticados como publicos.

## Rollback

- Sem migration/backfill nesta publicacao.
- Rollback tecnico: `git revert` do(s) commit(s) publicados e novo deploy Worker/Pages.
- Rollback operacional de dados: nao previsto, porque nao ha DDL nem script de escrita em massa.
