# AIRTRUST v0.4 — Runbook Oficial de Deploy Seguro (sem migration)

Este documento define o fluxo operacional padrão de deploy para produção sem mudanças de schema.

## 1. Deploy padrão sem migration
### Frontend
- `npm run deploy:pages`

### Worker (oficial)
- `npm run deploy:worker:safe`

O comando `deploy:worker:safe` é o padrão para rotina normal porque:
- não executa migration;
- não executa seed/sync/deduplicate/importação;
- injeta `APP_VERSION` e `APP_BUILD_TIME` reais;
- executa apenas `wrangler deploy --env production --config <tmp>`.

## 2. Checklist pré-deploy obrigatório
Executar e validar sucesso em todos:
- `git status --short --untracked-files=all`
- `git rev-parse HEAD origin/main` (deve estar alinhado)
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`
- `npm run test:worker`

## 3. Comandos proibidos no deploy comum
Não rodar em deploy rotineiro sem migration autorizada:
- qualquer `wrangler d1 migrations apply`
- `npm run deploy:worker`
- `npm run deploy:worker:only`

Esses comandos só podem ser usados em fase explicitamente autorizada para migration.

## 4. Quando usar comandos com migration
Somente quando TODOS os itens abaixo existirem:
- plano de migration documentado;
- backup validado;
- janela operacional aprovada;
- autorização explícita;
- smoke pós-deploy definido e executável.

## 5. Smoke pós-deploy read-only
Executar sempre após deploy:
- `bash scripts/smoke-production-readonly.sh`
- `BASE=https://api.airtrust.online bash scripts/smoke-test-core.sh`
- `bash scripts/smoke-tests.sh https://api.airtrust.online`

## 6. Verificações de saúde e versão
Conferir:
- `GET /api/health`
- `GET /api/version`

Critério:
- `version` e `builtAt` devem refletir o deploy atual (`APP_VERSION` e `APP_BUILD_TIME`).

## 7. Nunca executar em deploy comum
- sync SIGVOOS
- deduplicate apply
- importações
- seeds
- migrations

## 8. Guardrail read-only recomendado
Use a auditoria de scripts antes de deploy:
- `bash scripts/validation/audit-deploy-scripts.sh`

Objetivo:
- listar scripts que contêm `migrations apply`;
- validar que `deploy-worker-safe.sh` não contém comandos proibidos.
