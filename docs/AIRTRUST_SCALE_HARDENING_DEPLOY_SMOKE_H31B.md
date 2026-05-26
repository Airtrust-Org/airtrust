# AIRTRUST v0.5-H31-B — Deploy/Smoke pós hardening de escala

Date: 2026-05-26

## 1) HEAD deployado
- HEAD: `066aa42413756d32ce1ab260b84ee72842d757a2`
- Branch: `main`
- Divergência: `0/0` (HEAD == origin/main no início da fase)

## 2) Commits funcionais incluídos desde o deploy final anterior
- `bd0a42a` — fix(tenant): protect assistant and session listing
- `187c083` — fix(tenant): scope importacao by empresa
- `1c9bf05` — fix(api): return explicit errors on fail-open endpoints
- `f36da4d` — fix(simuladores): add pagination caps
- `6ae3a8b` — fix(observability): reuse request id in errors
- `066aa42` — perf(simuladores): add sessions summary query mode

## 3) Validações locais (árvore limpa)
Executadas em clone limpo temporário (`/tmp/airtrust-h31b-deploy`):
- `npx tsc -p worker-airtrust/tsconfig.json --noEmit` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run lint` ✅
- `npm run test:worker` ✅ (`457` testes passando)

## 4) Guardrail de deploy
- `bash scripts/validation/audit-deploy-scripts.sh` ✅
  - comandos com migration continuam identificados como restritos (`deploy-worker`, `deploy-worker:only`, scripts legados)
  - `deploy-worker-safe.sh` aprovado sem comandos proibidos
- `bash -n scripts/deploy-worker-safe.sh` ✅

## 5) Deploy frontend
- Comando: `npm run deploy:pages`
- Resultado: ✅ sucesso
- URL retornada pelo Pages deploy:
  - `https://00a84067.airtrust.pages.dev`

## 6) Deploy worker seguro
- Comando: `npm run deploy:worker:safe`
- Resultado: ✅ sucesso
- Worker: `airtrust-api-production`
- Rotas: `api.airtrust.online/*` + worker URL Cloudflare
- Version stamp publicado:
  - `APP_VERSION=2026-05-26T12:46:43Z-066aa42`
  - `APP_BUILD_TIME=2026-05-26T12:46:43Z`
- Version ID:
  - `c13a58ae-90b2-4124-b310-d417133336d5`

## 7) Smoke pós-deploy (read-only)
Scripts executados:
- `bash scripts/smoke-production-readonly.sh` ✅ PASS
- `BASE=https://api.airtrust.online bash scripts/smoke-test-core.sh` ✅ PASS (modo limitado sem credenciais)
- `bash scripts/smoke-tests.sh https://api.airtrust.online` ✅ 5/5

Checks diretos:
- `GET /api/health` ✅ healthy
- `GET /api/version` ✅
  - `version=2026-05-26T12:46:43Z-066aa42`
  - `builtAt=2026-05-26T12:46:43Z`

## 8) Confirmações operacionais da fase
- Nenhuma migration aplicada
- Nenhum comando `wrangler d1 migrations apply` executado
- Nenhuma escrita manual em banco
- Nenhum `seed` executado
- Nenhum `sync SIGVOOS` executado
- Nenhum `deduplicate` executado
- Nenhuma importação executada
- Nenhuma alteração funcional de código nesta fase

## 9) Pendências sugeridas (backlog controlado)
- H30-C: instrumentação/benchmark da query detalhada de `/api/simuladores/sessoes`
- H32: expansão de testes por domínio
- H33: modularização segura após cobertura e baseline de performance
