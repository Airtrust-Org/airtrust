# AIRTRUST - Validacao de Deploy (Escalas + Treinamentos + Integracoes)
Data: 2026-06-06

Este documento deve ser atualizado apos merge/push em `main` e execucao dos comandos de deploy.

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
| Merge/fast-forward para `main` | Pendente | A preencher apos integracao. |
| Push `main` | Pendente | A preencher apos `git push origin main`. |
| Deploy Worker | Pendente | A preencher apos `npm run deploy:worker:safe`. |
| Deploy Pages | Pendente | A preencher apos `npm run deploy:pages`. |
| Smoke read-only API | Pendente | A preencher apos scripts de smoke. |
| Smoke frontend publico | Pendente | A preencher apos deploy de Pages. |
| Smoke autenticado | Limitado | Credenciais `AIRTRUST_SMOKE_*`/`SMOKE_*`/`TEST_USER_*` ausentes no ambiente local. |

## Rollback

- Sem migration/backfill nesta publicacao.
- Rollback tecnico: `git revert` do(s) commit(s) publicados e novo deploy Worker/Pages.
- Rollback operacional de dados: nao previsto, porque nao ha DDL nem script de escrita em massa.
