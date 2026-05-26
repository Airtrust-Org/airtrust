# AIRTRUST v0.4-H22 — Worker safe deploy sem migration com version stamping

Data/Hora (UTC): 2026-05-26T02:44Z  
Responsável: Codex (execução controlada)

## 1. Problema
No H21, o deploy seguro do worker (`wrangler deploy --env production`) evitou migration, mas publicou com placeholders:
- `APP_VERSION="managed-by-script"`
- `APP_BUILD_TIME="managed-by-script"`

Impacto: `/api/version` respondia sem metadado real de versão/build.

## 2. Scripts antigos que aplicam migration (bloqueados)
- `npm run deploy:worker:only` → `scripts/deploy-worker-only.sh`
- Evidência no script: `wrangler d1 migrations apply airtrust-db --env production --remote`

Estes comandos não são permitidos em fases sem migration.

## 3. Novo comando seguro
### Script criado
- `scripts/deploy-worker-safe.sh`

### Comando adicionado
- `npm run deploy:worker:safe`

### Comportamento
- Verifica `branch == main`.
- Verifica `HEAD == origin/main`.
- Gera version stamp:
  - `APP_VERSION="<UTC_ISO>-<git_short_hash>"`
  - `APP_BUILD_TIME="<UTC_ISO>"`
- Cria `wrangler.toml` temporário com os valores injetados.
- Executa apenas deploy do worker:
  - `wrangler deploy --env production --config <tmp_wrangler>`
- Não executa migration, seed, sync, deduplicate ou importação.

## 4. Garantias operacionais
- Sem `wrangler d1 migrations apply`.
- Sem escrita manual em banco.
- Sem `seed`.
- Sem `sync`.
- Sem `deduplicate`.
- Sem importação.

## 5. Validação de segurança do script
Comandos executados:
- `grep -n "migrations apply\|wrangler d1\|seed\|deduplicate\|sync" scripts/deploy-worker-safe.sh`
- `bash -n scripts/deploy-worker-safe.sh`

Resultado:
- `SAFE: no forbidden commands`
- Sintaxe shell válida.

## 6. Validações locais antes do deploy
Executado:
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`
- `npm run test:worker`

Resultado:
- Todos passaram.
- `436` testes worker passando.

## 7. Deploy H22 executado
Comando:
- `npm run deploy:worker:safe`

Resultado:
- Worker: `airtrust-api-production`
- APP_VERSION publicado: `2026-05-26T02:43:02Z-4b9da71`
- APP_BUILD_TIME publicado: `2026-05-26T02:43:02Z`
- Worker Version ID: `946e9f04-642c-4825-a538-89153c0574e8`

## 8. Smoke read-only pós-deploy
Executado:
- `bash scripts/smoke-production-readonly.sh`
- `BASE=https://api.airtrust.online bash scripts/smoke-test-core.sh`
- `bash scripts/smoke-tests.sh https://api.airtrust.online`
- `curl -fsSL https://api.airtrust.online/api/version`

Resultado:
- Todos os scripts com `exit 0`.
- `smoke-tests.sh`: `5/5` checks pass.
- `/api/version` atualizado com version/build-time reais:
  - `version`: `2026-05-26T02:43:02Z-4b9da71`
  - `builtAt`: `2026-05-26T02:43:02Z`

## 9. Como usar no futuro
1. Garantir `main` alinhado com `origin/main`.
2. Rodar validações locais padrão.
3. Executar `npm run deploy:worker:safe`.
4. Executar smoke read-only padrão.
5. Registrar resultado operacional em documento de fase.

## 10. Promovido a runbook oficial em H23
- O fluxo de safe deploy deste documento foi promovido para runbook oficial em H23.
- Referência oficial: `docs/AIRTRUST_DEPLOY_RUNBOOK_v0_4.md`.
- Diferença operacional:
  - Safe deploy (rotina normal): `npm run deploy:worker:safe` (sem migration, com version stamping).
  - Deploy com migration: `npm run deploy:worker` e `npm run deploy:worker:only` (somente com autorização explícita e fase de migration).
