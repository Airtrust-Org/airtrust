# AIRTRUST v0.4-H21 — Deploy/Smoke consolidado sem migration automática

Data/Hora (UTC): 2026-05-26T02:38Z  
Responsável: Codex (execução controlada)

## 1. HEAD deployado
- Commit: `ad4a8a59ae6fb8365d912220c341cbb3a8d84806`
- Mensagem: `fix(admin): resolve caller role typecheck`
- Estado base confirmado: `HEAD == origin/main`, divergência `0/0`.

## 2. Validações locais (worktree limpa)
Worktree limpa criada em `/private/tmp/airtrust-h21-clean` no mesmo commit do HEAD.

Comandos executados:
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit`
- `npx tsc --noEmit`
- `npm run build`
- `npm run lint`
- `npm run test:worker`

Resultado:
- Todos os comandos passaram.
- Testes worker: `436` passando.

## 3. Auditoria de comandos de deploy
### Frontend
- Script: `npm run deploy:pages`
- Implementação: `wrangler pages deploy dist/client --project-name=airtrust --branch=production ...`
- Conclusão: seguro para H21 (não aplica migration D1).

### Worker
- Script bloqueado: `npm run deploy:worker:only`
  - Chama `scripts/deploy-worker-only.sh`.
  - Evidência: contém `wrangler d1 migrations apply airtrust-db --env production --remote`.
  - Conclusão: **NÃO permitido** em H21.

- Caminho seguro usado:
  - `cd worker-airtrust && npm run deploy`
  - Implementação: `wrangler deploy --env production`
  - Conclusão: deploy de código do Worker sem aplicar migrations.

## 4. Deploy executado
### Frontend
- Comando: `npm run deploy:pages`
- Resultado: sucesso.
- Deployment URL: `https://167ab44f.airtrust.pages.dev`

### Worker
- Comando: `cd worker-airtrust && npm run deploy`
- Resultado: sucesso.
- Worker: `airtrust-api-production`
- Rota: `api.airtrust.online/*`
- Version ID: `1cce7fc9-aff7-4762-8406-9abca0f6dc3a`

## 5. Garantias de segurança operacional
- Nenhuma migration aplicada.
- Nenhum comando `wrangler d1 migrations apply` executado nesta fase.
- Nenhuma escrita manual em banco.
- Nenhum seed, sync SIGVOOS, deduplicate, ou importação executados.

## 6. Smoke pós-deploy (read-only)
Comandos:
- `bash scripts/smoke-production-readonly.sh`
- `BASE=https://api.airtrust.online bash scripts/smoke-test-core.sh`
- `bash scripts/smoke-tests.sh https://api.airtrust.online`
- `curl -fsSL https://api.airtrust.online/api/health`
- `curl -fsSL https://api.airtrust.online/api/version`

Resultado:
- Todos os scripts retornaram `exit 0`.
- `smoke-tests.sh`: `5/5` checks pass.
- `/api/health`: `success=true`, status `healthy`.
- `/api/version`: `success=true`, versão retornada `managed-by-script`.

## 7. Pendências
- Como o caminho seguro do worker evita o script que injeta metadados, `APP_VERSION`/`APP_BUILD_TIME` permaneceram como `managed-by-script` nesta publicação.
- Próxima fase recomendada: criar comando de deploy worker seguro sem migration **e** com injeção de versão/build-time (sem tocar em D1 migrations).

## 8. Próximos passos recomendados
1. Criar `deploy:worker:safe` (somente `wrangler deploy`, sem migration) com injeção de `APP_VERSION`/`APP_BUILD_TIME`.
2. Revalidar `api/version` após novo deploy safe para confirmar metadados reais.
3. Seguir para item funcional menor da auditoria ou H6-E, conforme prioridade operacional.

## 9. Follow-up H22
- Follow-up executado em H22: criação do comando `deploy:worker:safe` com version stamping sem migration.
- Evidências e execução operacional registradas em:
  - `docs/AIRTRUST_WORKER_SAFE_DEPLOY_H22.md`
